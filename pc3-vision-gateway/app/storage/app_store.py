from __future__ import annotations

import json
import sqlite3
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from app.schemas.feature import FeaturePayload
from app.schemas.routine import RecommendationRequest, RecommendationResponse


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _load(value: str | None, default: Any) -> Any:
    if not value:
        return deepcopy(default)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return deepcopy(default)


def _date_text(value: date | str | None) -> str:
    if isinstance(value, date):
        return value.isoformat()
    if value:
        return str(value)
    return date.today().isoformat()


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


class AppStore:
    def __init__(self, database_path: Path) -> None:
        self._database_path = database_path
        self._lock = RLock()
        self._initialize_database()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_database(self) -> None:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._database_path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY,
                    profile_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS routine_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    routine_id TEXT NOT NULL UNIQUE,
                    user_id TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS routine_days (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    routine_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    scheduled_date TEXT NOT NULL,
                    day_index INTEGER NOT NULL,
                    day_label TEXT NOT NULL,
                    focus TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    weekly_focus TEXT NOT NULL,
                    day_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_routine_days_user_date
                    ON routine_days (user_id, scheduled_date);
                CREATE TABLE IF NOT EXISTS body_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    measured_date TEXT NOT NULL,
                    weight_kg REAL NOT NULL,
                    memo TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_body_metrics_user_date
                    ON body_metrics (user_id, measured_date);
                CREATE TABLE IF NOT EXISTS workout_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    routine_id TEXT,
                    routine_day_id TEXT,
                    exercise_type TEXT NOT NULL,
                    completed_reps INTEGER,
                    duration_sec REAL,
                    stability_score REAL,
                    posture_errors_json TEXT NOT NULL,
                    measurement_quality TEXT,
                    measurement_confidence REAL,
                    status TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_workout_results_user_created
                    ON workout_results (user_id, created_at);
                CREATE TABLE IF NOT EXISTS coach_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    user_id TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    final_response_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_coach_logs_user_created
                    ON coach_logs (user_id, created_at);
                """
            )
            connection.commit()

    def list_profiles(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT user_id, profile_json FROM user_profiles ORDER BY created_at ASC"
            ).fetchall()
        return [self._profile_from_row(row) for row in rows]

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT user_id, profile_json FROM user_profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return self._profile_from_row(row) if row else None

    def upsert_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        user_id = str(profile.get("id") or profile.get("user_id") or "").strip()
        if not user_id:
            raise ValueError("profile id is required")
        normalized = {**profile, "id": user_id}
        normalized.pop("user_id", None)
        now = _now()
        with self._lock, self._connect() as connection:
            existing = connection.execute(
                "SELECT user_id FROM user_profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if existing:
                connection.execute(
                    """
                    UPDATE user_profiles
                    SET profile_json = ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (_dump(normalized), now, user_id),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO user_profiles (user_id, profile_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (user_id, _dump(normalized), now, now),
                )
            connection.commit()
        return normalized

    def delete_user(self, user_id: str) -> None:
        with self._lock, self._connect() as connection:
            for table in (
                "coach_logs",
                "workout_results",
                "body_metrics",
                "routine_days",
                "routine_plans",
                "user_profiles",
            ):
                connection.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            connection.commit()

    def save_body_metric(
        self,
        *,
        user_id: str,
        measured_date: str,
        weight_kg: float,
        memo: str | None,
    ) -> dict[str, Any]:
        now = _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO body_metrics (user_id, measured_date, weight_kg, memo, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, measured_date, weight_kg, memo, now),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM body_metrics WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        return self._body_metric_record(row)

    def save_routine_plan(
        self,
        request: RecommendationRequest,
        response: RecommendationResponse,
    ) -> dict[str, Any]:
        response_json = response.model_dump(mode="json")
        pc3_payload = dict(response_json.get("pc3_payload") or {})
        routine_id = str(response_json.get("routine_id") or pc3_payload.get("routine_id") or "")
        if not routine_id:
            routine_id = f"routine_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        start_date = _date_text(response_json.get("start_date") or pc3_payload.get("start_date") or request.start_date)
        days = response_json.get("weekly_routine") or []
        scheduled_dates = list(response_json.get("scheduled_dates") or pc3_payload.get("scheduled_dates") or [])
        if len(scheduled_dates) < len(days):
            base = date.fromisoformat(start_date)
            scheduled_dates = [(base + timedelta(days=index)).isoformat() for index in range(len(days))]

        pc3_payload.update(
            {
                "routine_id": routine_id,
                "start_date": start_date,
                "scheduled_dates": scheduled_dates,
            }
        )
        response_json.update(
            {
                "routine_id": routine_id,
                "start_date": start_date,
                "scheduled_dates": scheduled_dates,
                "pc3_payload": pc3_payload,
            }
        )
        profile = request.profile.model_dump(mode="json", exclude_none=True)
        profile["id"] = request.user_id
        self.upsert_profile(profile)

        now = _now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO routine_plans
                    (routine_id, user_id, profile_json, request_json, response_json, start_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    routine_id,
                    request.user_id,
                    _dump(profile),
                    _dump(request.model_dump(mode="json")),
                    _dump(response_json),
                    start_date,
                    now,
                ),
            )
            for index, day in enumerate(days):
                scheduled_date = scheduled_dates[index] if index < len(scheduled_dates) else start_date
                connection.execute(
                    """
                    INSERT INTO routine_days
                        (routine_id, user_id, scheduled_date, day_index, day_label, focus,
                         summary, weekly_focus, day_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        routine_id,
                        request.user_id,
                        scheduled_date,
                        int(day.get("day_index") or index + 1),
                        str(day.get("day_label") or f"Day {index + 1}"),
                        str(day.get("focus") or ""),
                        str(response_json.get("description") or response_json.get("summary") or ""),
                        str(response_json.get("pc3_payload", {}).get("weekly_focus") or response_json.get("description") or ""),
                        _dump(day),
                        now,
                    ),
                )
            connection.commit()
        return response_json

    def get_routine_day(self, user_id: str, target_date: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM routine_days
                WHERE user_id = ? AND scheduled_date = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (user_id, target_date),
            ).fetchone()
        return self._routine_day_record(row) if row else None

    def get_routine_calendar(self, user_id: str, from_date: str, to_date: str) -> dict[str, Any]:
        if to_date < from_date:
            from_date, to_date = to_date, from_date
        with self._lock, self._connect() as connection:
            routine_rows = connection.execute(
                """
                SELECT * FROM routine_days
                WHERE user_id = ? AND scheduled_date >= ? AND scheduled_date <= ?
                ORDER BY scheduled_date ASC, created_at DESC, id DESC
                """,
                (user_id, from_date, to_date),
            ).fetchall()
            workout_rows = connection.execute(
                "SELECT * FROM workout_results WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            log_rows = connection.execute(
                "SELECT * FROM coach_logs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()

        routines_by_date: dict[str, dict[str, Any]] = {}
        for row in routine_rows:
            key = row["scheduled_date"]
            if key not in routines_by_date:
                routines_by_date[key] = self._routine_day_record(row)

        workouts = [self._workout_record(row) for row in workout_rows]
        logs = [self._coach_log_record(row) for row in log_rows]
        logs_by_session: dict[str, list[int]] = {}
        for log in logs:
            session_id = str(log.get("session_id") or "")
            if session_id and log.get("id") is not None:
                logs_by_session.setdefault(session_id, []).append(int(log["id"]))

        days: list[dict[str, Any]] = []
        current = date.fromisoformat(from_date)
        end = date.fromisoformat(to_date)
        while current <= end:
            key = current.isoformat()
            routine = routines_by_date.get(key, {})
            routine_day_id = routine.get("routine_day_id")
            day_workouts = [
                item
                for item in workouts
                if item.get("routine_day_id") == routine_day_id
                or (not item.get("routine_day_id") and str(item.get("created_at") or "").startswith(key))
            ]
            completed = [item for item in day_workouts if item.get("status") != "skipped"]
            skipped = [item for item in day_workouts if item.get("status") == "skipped"]
            coach_ids: list[int] = []
            for workout in day_workouts:
                coach_ids.extend(logs_by_session.get(str(workout.get("session_id") or ""), []))
            days.append(
                {
                    "date": key,
                    "routine_id": routine.get("routine_id"),
                    "routine_day_id": routine_day_id,
                    "day_index": routine.get("day_index"),
                    "focus": routine.get("focus"),
                    "exercises": routine.get("exercises") or [],
                    "completed": bool(completed),
                    "skipped": bool(skipped) and not completed,
                    "skipped_count": len(skipped),
                    "workout_results": day_workouts,
                    "coach_log_ids": sorted(set(coach_ids)),
                }
            )
            current += timedelta(days=1)
        return {"user_id": user_id, "from_date": from_date, "to_date": to_date, "days": days}

    def save_completed_workout(
        self,
        payload: FeaturePayload,
        request_json: dict[str, Any],
        coaching_json: dict[str, Any],
    ) -> int:
        exercise = request_json.get("features", {}).get("exercise", {})
        return self._save_workout_result(
            session_id=payload.session_id or f"session_{datetime.now(timezone.utc).timestamp()}",
            user_id=payload.user_id,
            routine_id=payload.routine_id,
            routine_day_id=payload.routine_day_id,
            exercise_type=str(exercise.get("type") or "unknown"),
            completed_reps=exercise.get("count") if exercise.get("count") is not None else exercise.get("rep_count"),
            duration_sec=exercise.get("duration_sec") if exercise.get("duration_sec") is not None else exercise.get("duration_seconds"),
            stability_score=exercise.get("stability_score"),
            posture_errors=exercise.get("posture_errors") or [],
            measurement_quality=exercise.get("measurement_quality"),
            measurement_confidence=exercise.get("measurement_confidence"),
            status="completed",
            result_json={
                "summary": coaching_json.get("summary"),
                "warnings": coaching_json.get("warnings") or [],
                "pc2_payload": coaching_json.get("pc2_payload") or {},
                "baseline_diff": request_json.get("baseline_diff") or {},
            },
        )

    def save_skipped_workout(
        self,
        *,
        session_id: str,
        user_id: str,
        routine_id: str | None,
        routine_day_id: str | int | None,
        exercise: Any,
        reason: str | None,
    ) -> int:
        return self._save_workout_result(
            session_id=session_id,
            user_id=user_id,
            routine_id=routine_id,
            routine_day_id=routine_day_id,
            exercise_type=str(getattr(exercise, "type", None) or "unknown"),
            completed_reps=getattr(exercise, "count", None),
            duration_sec=getattr(exercise, "duration_sec", None),
            stability_score=getattr(exercise, "stability_score", None),
            posture_errors=getattr(exercise, "posture_errors", None) or [],
            measurement_quality=getattr(exercise, "measurement_quality", None),
            measurement_confidence=getattr(exercise, "measurement_confidence", None),
            status="skipped",
            result_json={"status": "skipped", "skip_reason": reason},
        )

    def save_coach_log(
        self,
        *,
        session_id: str | None,
        user_id: str,
        request_json: dict[str, Any],
        final_response_json: dict[str, Any],
    ) -> int:
        now = _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO coach_logs (session_id, user_id, request_json, final_response_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, user_id, _dump(request_json), _dump(final_response_json), now),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def get_coach_logs(self, user_id: str, limit: int = 10) -> dict[str, Any]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM coach_logs
                WHERE user_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return {"user_id": user_id, "logs": [self._coach_log_record(row) for row in rows]}

    def get_user_progress(self, user_id: str, days: int = 30) -> dict[str, Any]:
        days = max(1, min(int(days), 365))
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        since_date = (date.today() - timedelta(days=days)).isoformat()
        with self._lock, self._connect() as connection:
            metric_rows = connection.execute(
                """
                SELECT * FROM body_metrics
                WHERE user_id = ? AND measured_date >= ?
                ORDER BY measured_date ASC, created_at ASC
                """,
                (user_id, since_date),
            ).fetchall()
            workout_rows = connection.execute(
                """
                SELECT * FROM workout_results
                WHERE user_id = ? AND created_at >= ?
                ORDER BY created_at DESC, id DESC
                """,
                (user_id, since),
            ).fetchall()
        metrics = [self._body_metric_record(row) for row in metric_rows]
        workouts = [self._workout_record(row) for row in workout_rows]
        completed = [item for item in workouts if item.get("status") != "skipped"]
        skipped = [item for item in workouts if item.get("status") == "skipped"]
        stability = [float(item["stability_score"]) for item in completed if item.get("stability_score") is not None]
        by_exercise: dict[str, int] = {}
        for item in completed:
            exercise = str(item.get("exercise_type") or "unknown")
            by_exercise[exercise] = by_exercise.get(exercise, 0) + 1
        weight_delta = None
        if len(metrics) >= 2:
            weight_delta = round(float(metrics[-1]["weight_kg"]) - float(metrics[0]["weight_kg"]), 2)
        return {
            "user_id": user_id,
            "days": days,
            "body_metrics": metrics,
            "weight_delta_kg": weight_delta,
            "workout_summary": {
                "session_count": len({item.get("session_id") for item in completed if item.get("session_id")}),
                "workout_count": len(completed),
                "skipped_count": len(skipped),
                "total_reps": sum(int(item.get("completed_reps") or 0) for item in completed),
                "total_duration_sec": sum(float(item.get("duration_sec") or 0) for item in completed),
                "avg_stability_score": round(sum(stability) / len(stability), 3) if stability else None,
                "by_exercise": by_exercise,
            },
            "recent_workouts": workouts[:10],
            "recent_coaching": self.get_coach_logs(user_id, limit=5)["logs"],
            "latest_routine": self.get_latest_routine(user_id),
        }

    def get_user_history_snapshot(self, user_id: str) -> dict[str, Any]:
        calendar_from = (date.today() - timedelta(days=14)).isoformat()
        calendar_to = date.today().isoformat()
        return {
            "body_metrics": self.get_recent_body_metrics(user_id, limit=5),
            "workout_results": self.get_recent_workouts(user_id, limit=10),
            "coach_logs": self.get_coach_logs(user_id, limit=5)["logs"],
            "latest_routine": self.get_latest_routine(user_id),
            "calendar_days": self.get_routine_calendar(user_id, calendar_from, calendar_to)["days"],
        }

    def get_recent_body_metrics(self, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM body_metrics
                WHERE user_id = ?
                ORDER BY measured_date DESC, created_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [self._body_metric_record(row) for row in rows]

    def get_recent_workouts(self, user_id: str, limit: int = 10) -> list[dict[str, Any]]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM workout_results
                WHERE user_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        return [self._workout_record(row) for row in rows]

    def get_latest_routine(self, user_id: str) -> dict[str, Any] | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM routine_plans
                WHERE user_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "routine_id": row["routine_id"],
            "user_id": row["user_id"],
            "profile": _load(row["profile_json"], {}),
            "routine_response": _load(row["response_json"], {}),
            "start_date": row["start_date"],
            "created_at": row["created_at"],
        }

    def _save_workout_result(
        self,
        *,
        session_id: str,
        user_id: str,
        routine_id: str | None,
        routine_day_id: str | int | None,
        exercise_type: str,
        completed_reps: Any,
        duration_sec: Any,
        stability_score: Any,
        posture_errors: list[str],
        measurement_quality: str | None,
        measurement_confidence: Any,
        status: str,
        result_json: dict[str, Any],
    ) -> int:
        now = _now()
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO workout_results
                    (session_id, user_id, routine_id, routine_day_id, exercise_type,
                     completed_reps, duration_sec, stability_score, posture_errors_json,
                     measurement_quality, measurement_confidence, status, result_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    user_id,
                    routine_id,
                    str(routine_day_id) if routine_day_id is not None else None,
                    exercise_type,
                    int(completed_reps) if completed_reps is not None else None,
                    float(duration_sec) if duration_sec is not None else None,
                    float(stability_score) if stability_score is not None else None,
                    _dump(posture_errors),
                    measurement_quality,
                    float(measurement_confidence) if measurement_confidence is not None else None,
                    status,
                    _dump(result_json),
                    now,
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def _profile_from_row(self, row: sqlite3.Row) -> dict[str, Any]:
        profile = _load(row["profile_json"], {})
        profile["id"] = str(profile.get("id") or row["user_id"])
        return profile

    def _body_metric_record(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "measured_date": row["measured_date"],
            "weight_kg": row["weight_kg"],
            "memo": row["memo"],
            "created_at": row["created_at"],
        }

    def _routine_day_record(self, row: sqlite3.Row) -> dict[str, Any]:
        day = _load(row["day_json"], {})
        return {
            "routine_day_id": row["id"],
            "routine_id": row["routine_id"],
            "user_id": row["user_id"],
            "scheduled_date": row["scheduled_date"],
            "day_index": row["day_index"],
            "day_label": row["day_label"],
            "focus": row["focus"],
            "exercises": day.get("exercises") or [],
            "summary": row["summary"],
            "weekly_focus": row["weekly_focus"],
            "message": f"{row['day_label']} - {row['focus']}",
            "created_at": row["created_at"],
        }

    def _workout_record(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "routine_id": row["routine_id"],
            "routine_day_id": _to_int(row["routine_day_id"]),
            "exercise_type": row["exercise_type"],
            "completed_reps": row["completed_reps"],
            "duration_sec": row["duration_sec"],
            "stability_score": row["stability_score"],
            "posture_errors": _load(row["posture_errors_json"], []),
            "measurement_quality": row["measurement_quality"],
            "measurement_confidence": row["measurement_confidence"],
            "status": row["status"],
            "result": _load(row["result_json"], {}),
            "created_at": row["created_at"],
        }

    def _coach_log_record(self, row: sqlite3.Row) -> dict[str, Any]:
        final_response = _load(row["final_response_json"], {})
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "request": _load(row["request_json"], {}),
            "pc2_output": final_response.get("pc2_payload") or {},
            "final_response": final_response,
            "created_at": row["created_at"],
        }
