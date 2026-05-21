from __future__ import annotations

from datetime import date
from urllib.parse import quote

import httpx

from app.config import Settings
from app.schemas.coaching import CoachingResponse
from app.schemas.feature import FeaturePayload
from app.schemas.routine import (
    RecommendationRequest,
    RecommendationResponse,
    RoutineDayResponse,
    RoutineItemPayload,
    WeeklyRoutineDayPayload,
    WeeklyRoutineExercisePayload,
)


PC2_EXERCISE_FIELDS = {
    "type",
    "count",
    "rep_count",
    "state",
    "stability_score",
    "posture_errors",
    "squat_depth",
    "knee_angle",
    "back_angle",
    "duration_sec",
    "duration_seconds",
    "tempo",
    "measurement_quality",
    "measurement_confidence",
}
PC2_BASELINE_DIFF_FIELDS = {
    "count_change",
    "stability_change",
    "knee_angle_change",
    "squat_depth_change",
    "duration_change",
}
SUPPORTED_ROUTINE_EXERCISES = {"squat", "jumping_jack", "knee_raise", "lunge", "pushup"}
ROUTINE_EXERCISE_ALIASES = {
    "squat": "squat",
    "jumping_jack": "jumping_jack",
    "jumping jack": "jumping_jack",
    "jumping-jack": "jumping_jack",
    "knee_raise": "knee_raise",
    "knee raise": "knee_raise",
    "knee-raise": "knee_raise",
    "lunge": "lunge",
    "pushup": "pushup",
    "push up": "pushup",
    "push-up": "pushup",
    "push_up": "pushup",
}
WEEKLY_FREQUENCY_TO_DAYS = {
    "once_twice": 2,
    "three_four": 4,
    "five_plus": 5,
}


class CoachClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, payload: FeaturePayload) -> CoachingResponse:
        async with httpx.AsyncClient(timeout=self._settings.pc2_timeout_seconds) as client:
            response = await client.post(
                self._settings.pc2_coach_api_url,
                json=self.build_pc2_request_json(payload),
            )
            response.raise_for_status()
        return CoachingResponse.model_validate(response.json())

    async def generate_routine(
        self,
        request: RecommendationRequest,
        user_history: dict | None = None,
    ) -> RecommendationResponse:
        async with httpx.AsyncClient(timeout=self._settings.pc2_timeout_seconds) as client:
            response = await client.post(
                self._settings.pc2_routine_api_url,
                json=self.build_pc2_routine_request_json(request, user_history=user_history),
            )
            response.raise_for_status()
        return self.pc2_routine_response_to_recommendation(request, response.json())

    async def get_routine_calendar(self, user_id: str, from_date: date, to_date: date) -> dict:
        template = self._settings.pc2_routine_calendar_api_url
        url = self._format_pc2_url(
            template,
            user_id=user_id,
            from_date=from_date.isoformat(),
            to_date=to_date.isoformat(),
        )
        params = {}
        if "{from_date}" not in template:
            params["from_date"] = from_date.isoformat()
        if "{to_date}" not in template:
            params["to_date"] = to_date.isoformat()
        return await self._get_json(url, params=params or None)

    async def get_routine_day(self, user_id: str, target_date: date) -> RoutineDayResponse:
        url = self._routine_day_url(user_id, target_date)
        params = None if "{target_date}" in self._settings.pc2_routine_day_api_url else {
            "target_date": target_date.isoformat()
        }
        async with httpx.AsyncClient(timeout=self._settings.pc2_timeout_seconds) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        return self.pc2_routine_day_response_to_pc1(response.json())

    async def save_body_metric(self, user_id: str, payload: dict) -> dict:
        url = self._format_pc2_url(self._settings.pc2_body_metrics_api_url, user_id=user_id)
        return await self._post_json(url, payload)

    async def get_user_progress(self, user_id: str, days: int) -> dict:
        template = self._settings.pc2_progress_api_url
        url = self._format_pc2_url(template, user_id=user_id, days=str(days))
        params = None if "{days}" in template else {"days": days}
        return await self._get_json(url, params=params)

    async def get_coach_logs(self, user_id: str, limit: int) -> dict:
        template = self._settings.pc2_coach_logs_api_url
        url = self._format_pc2_url(template, user_id=user_id, limit=str(limit))
        params = None if "{limit}" in template else {"limit": limit}
        return await self._get_json(url, params=params)

    async def save_workout_skip(self, payload: dict) -> dict:
        return await self._post_json(self._settings.pc2_workout_skip_api_url, payload)

    def build_pc2_request_json(self, payload: FeaturePayload) -> dict:
        exercise = payload.features.exercise
        if payload.mode != "exercise" or payload.event != "session_completed" or exercise is None:
            raise ValueError("PC2 coach requests are only supported for completed exercise sessions.")

        request: dict = {
            "user_id": payload.user_id,
            "session_id": payload.session_id,
            "mode": "exercise",
            "event": "session_completed",
            "features": {
                "exercise": self._dump_pc2_exercise(exercise),
            },
        }
        if payload.routine_id is not None:
            request["routine_id"] = payload.routine_id
        if payload.routine_day_id is not None:
            request["routine_day_id"] = payload.routine_day_id

        exercise_diff = payload.baseline_diff.get("exercise") if payload.baseline_diff else None
        request["baseline_diff"] = (
            {"exercise": self._dump_pc2_baseline_diff(exercise_diff)}
            if exercise_diff is not None
            else {}
        )

        if payload.environment is not None:
            environment = payload.environment.model_dump(mode="json", exclude_none=True)
            if environment:
                request["environment"] = environment
        if payload.purpose:
            request["purpose"] = payload.purpose
        return request

    def build_pc2_routine_request_json(
        self,
        request: RecommendationRequest,
        user_history: dict | None = None,
    ) -> dict:
        profile = request.profile
        self._validate_routine_profile(profile)
        payload: dict = {
            "user_id": request.user_id,
            "user_goal": request.pc2_user_goal or profile.goal,
            "exercise_experience": request.pc2_exercise_experience or profile.experience_level,
            "available_days_per_week": (
                request.pc2_available_days_per_week
                or WEEKLY_FREQUENCY_TO_DAYS[profile.weekly_frequency]
            ),
            "restricted_body_parts": (
                list(request.pc2_restricted_body_parts)
                if request.pc2_restricted_body_parts
                else list(profile.limitations)
            ),
            "purpose": request.purpose or "pre_exercise_routine",
        }
        if profile.name:
            payload["profile_name"] = profile.name
        if profile.weight_kg is not None:
            payload["weight_kg"] = profile.weight_kg
        if request.start_date is not None:
            payload["start_date"] = request.start_date.isoformat()
        if user_history is not None:
            payload["user_history"] = user_history
        return payload

    def pc2_routine_response_to_recommendation(
        self,
        request: RecommendationRequest,
        response_json: dict,
    ) -> RecommendationResponse:
        difficulty = self._difficulty_from_profile(request)
        pc3_payload = response_json.get("pc3_payload") if isinstance(response_json.get("pc3_payload"), dict) else {}
        weekly_routine = self._normalize_weekly_routine(
            response_json.get("weekly_routine") or pc3_payload.get("weekly_routine")
        )
        items = self._routine_items_from_weekly_routine(weekly_routine, response_json)
        if not items:
            raise ValueError("PC2 routine response did not contain a usable weekly routine.")

        cautions = [str(item) for item in response_json.get("cautions", []) if item]
        weekly_focus = str(response_json.get("weekly_focus") or "")
        summary = str(response_json.get("summary") or "PC2가 루틴을 생성했습니다.")
        reason_lines = [item for item in [weekly_focus, *cautions] if item]
        return RecommendationResponse(
            source="ai",
            difficulty=difficulty,
            title="PC2 추천 루틴",
            description=summary,
            reason_lines=reason_lines,
            estimated_minutes=self._estimate_minutes(items),
            start_exercise_type=items[0].exercise_type,
            items=items,
            routine_id=pc3_payload.get("routine_id") or response_json.get("routine_id"),
            start_date=pc3_payload.get("start_date") or response_json.get("start_date"),
            scheduled_dates=list(pc3_payload.get("scheduled_dates") or response_json.get("scheduled_dates") or []),
            weekly_routine=weekly_routine,
            pc3_payload=pc3_payload,
        )

    def pc2_routine_day_response_to_pc1(self, response_json: dict) -> RoutineDayResponse:
        exercises = self._normalize_weekly_exercises(response_json.get("exercises"))
        return RoutineDayResponse(
            routine_day_id=response_json.get("routine_day_id"),
            routine_id=str(response_json.get("routine_id") or ""),
            user_id=str(response_json.get("user_id") or ""),
            scheduled_date=str(response_json.get("scheduled_date") or ""),
            day_index=int(response_json.get("day_index") or 1),
            day_label=str(response_json.get("day_label") or "Day 1"),
            focus=str(response_json.get("focus") or "자세 안정"),
            exercises=exercises,
            summary=str(response_json.get("summary") or ""),
            weekly_focus=str(response_json.get("weekly_focus") or ""),
            message=str(response_json.get("message") or ""),
            created_at=response_json.get("created_at"),
        )

    def _dump_pc2_exercise(self, exercise) -> dict:
        raw = exercise.model_dump(mode="json", exclude_none=True)
        return {key: value for key, value in raw.items() if key in PC2_EXERCISE_FIELDS}

    def _dump_pc2_baseline_diff(self, exercise_diff: dict) -> dict:
        return {
            key: value
            for key, value in exercise_diff.items()
            if key in PC2_BASELINE_DIFF_FIELDS and value is not None
        }

    def _routine_day_url(self, user_id: str, target_date: date) -> str:
        return self._settings.pc2_routine_day_api_url.format(
            user_id=quote(user_id, safe=""),
            target_date=target_date.isoformat(),
        )

    async def _get_json(self, url: str, params: dict | None = None) -> dict:
        async with httpx.AsyncClient(timeout=self._settings.pc2_timeout_seconds) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        return self._response_json_object(response)

    async def _post_json(self, url: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self._settings.pc2_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        return self._response_json_object(response)

    def _response_json_object(self, response: httpx.Response) -> dict:
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("PC2 response must be a JSON object.")
        return data

    def _format_pc2_url(self, template: str, **values: str) -> str:
        encoded = {key: quote(str(value), safe="") for key, value in values.items()}
        return template.format(**encoded)

    def _routine_items_from_weekly_routine(
        self,
        weekly_routine: list[WeeklyRoutineDayPayload],
        response_json: dict,
    ) -> list[RoutineItemPayload]:
        items: list[RoutineItemPayload] = []
        for day in weekly_routine:
            for exercise in day.exercises:
                reps = exercise.reps or self._duration_to_reps(exercise.duration_sec)
                rest_sec = exercise.rest_sec
                items.append(
                    RoutineItemPayload(
                        exercise_type=exercise.exercise,
                        title=f"{day.day_label or f'Day {day.day_index}'} - {self._exercise_label(exercise.exercise)}",
                        reps=max(1, int(reps or 8)),
                        rest_sec=max(0, int(rest_sec if rest_sec is not None else 60)),
                        focus=exercise.focus or day.focus or "자세 안정",
                        summary=exercise.reason or day.focus or response_json.get("weekly_focus") or "",
                        sets=exercise.sets,
                        duration_sec=exercise.duration_sec,
                        reason=exercise.reason,
                        how_to=exercise.how_to,
                        tips=exercise.tips,
                    )
                )
                if len(items) >= 3:
                    break
            if len(items) >= 3:
                break
        return items

    def _normalize_weekly_routine(self, value) -> list[WeeklyRoutineDayPayload]:
        if not isinstance(value, list):
            return []

        days: list[WeeklyRoutineDayPayload] = []
        for index, day in enumerate(value, start=1):
            if not isinstance(day, dict):
                continue
            exercises = self._normalize_weekly_exercises(day.get("exercises"))
            if not exercises:
                continue
            days.append(
                WeeklyRoutineDayPayload(
                    day_index=int(day.get("day_index") or index),
                    day_label=str(day.get("day_label") or f"Day {index}"),
                    focus=str(day.get("focus") or "자세 안정"),
                    exercises=exercises,
                )
            )
        return days

    def _normalize_weekly_exercises(self, value) -> list[WeeklyRoutineExercisePayload]:
        if not isinstance(value, list):
            return []

        exercises: list[WeeklyRoutineExercisePayload] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            exercise_type = self._normalize_routine_exercise(item.get("exercise"))
            if exercise_type is None:
                continue
            exercises.append(
                WeeklyRoutineExercisePayload(
                    exercise=exercise_type,
                    sets=self._optional_int(item.get("sets")),
                    reps=self._optional_int(item.get("reps")),
                    duration_sec=self._optional_int(item.get("duration_sec")),
                    rest_sec=self._optional_int(item.get("rest_sec")),
                    focus=str(item.get("focus") or "자세 안정"),
                    reason=str(item.get("reason") or ""),
                    how_to=str(item.get("how_to") or ""),
                    tips=str(item.get("tips") or ""),
                )
            )
        return exercises

    def _validate_routine_profile(self, profile) -> None:
        missing = []
        if profile.goal is None:
            missing.append("profile.goal")
        if profile.experience_level is None:
            missing.append("profile.experience_level")
        if profile.weekly_frequency is None:
            missing.append("profile.weekly_frequency")
        if missing:
            raise ValueError("Missing routine profile fields: " + ", ".join(missing))

    def _difficulty_from_profile(self, request: RecommendationRequest) -> str:
        profile = request.profile
        if profile.experience_level == "consistent" or profile.weekly_frequency == "five_plus":
            return "challenge"
        if profile.experience_level == "beginner" or profile.weekly_frequency == "once_twice":
            return "easy"
        return "normal"

    def _normalize_routine_exercise(self, value) -> str | None:
        raw_label = str(value or "").strip().lower()
        if raw_label in ROUTINE_EXERCISE_ALIASES:
            return ROUTINE_EXERCISE_ALIASES[raw_label]
        raw = raw_label.replace("-", "_").replace(" ", "_")
        if raw in ROUTINE_EXERCISE_ALIASES:
            return ROUTINE_EXERCISE_ALIASES[raw]
        for exercise_type in SUPPORTED_ROUTINE_EXERCISES:
            if exercise_type in raw:
                return exercise_type
        return None

    def _duration_to_reps(self, duration_sec) -> int | None:
        if duration_sec is None:
            return None
        return max(1, int(float(duration_sec) / 3))

    def _optional_int(self, value) -> int | None:
        if value is None:
            return None
        return int(value)

    def _estimate_minutes(self, items: list[RoutineItemPayload]) -> int:
        total_reps = sum(item.reps for item in items)
        total_rest = sum(item.rest_sec for item in items)
        return max(8, round((total_reps * 3 + total_rest) / 60))

    def _exercise_label(self, exercise_type: str) -> str:
        return exercise_type.replace("_", " ")
