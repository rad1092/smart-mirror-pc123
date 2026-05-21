from __future__ import annotations

import json
import logging
import sqlite3
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any


logger = logging.getLogger(__name__)


class BaselineStore:
    def __init__(self, baseline_path: Path, database_path: Path | None = None) -> None:
        self._baseline_path = baseline_path
        self._database_path = database_path
        self._default_data = self._load_default()
        self._memory_baselines: dict[str, dict[str, Any]] = {}
        self._lock = RLock()
        if self._database_path is not None:
            self._initialize_database()

    def _load_default(self) -> dict[str, Any]:
        try:
            with self._baseline_path.open("r", encoding="utf-8") as file:
                return json.load(file)
        except FileNotFoundError:
            logger.warning("Baseline file not found: %s", self._baseline_path)
        except json.JSONDecodeError:
            logger.exception("Baseline file is not valid JSON: %s", self._baseline_path)
        return {
            "user_id": "default",
            "exercise": {"squat": {"avg_count": 15, "avg_stability_score": 0.82}},
            "body": {},
            "environment": {"baseline_illuminance": 360},
        }

    def _initialize_database(self) -> None:
        assert self._database_path is not None
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._database_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS user_baselines (
                    user_id TEXT PRIMARY KEY,
                    baseline_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        if self._database_path is None:
            raise RuntimeError("Baseline database path is not configured")
        return sqlite3.connect(self._database_path)

    def get_baseline(self, user_id: str) -> dict[str, Any]:
        with self._lock:
            baseline = self._get_user_baseline(user_id)
            if baseline is not None:
                return baseline
            fallback = deepcopy(self._default_data)
            fallback["user_id"] = user_id if user_id else fallback.get("user_id", "default")
            return fallback

    def get_source(self, user_id: str) -> str:
        with self._lock:
            return "user" if self._get_user_baseline(user_id) is not None else "default"

    def upsert_baseline(self, user_id: str, baseline_updates: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            base = self._get_user_baseline(user_id) or self._default_data
            merged = self._merge_baseline(base, baseline_updates)
            merged["user_id"] = user_id
            if self._database_path is None:
                self._memory_baselines[user_id] = merged
                return deepcopy(merged)
            now = datetime.now(timezone.utc).isoformat()
            baseline_json = json.dumps(merged, ensure_ascii=False)
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO user_baselines (user_id, baseline_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        baseline_json = excluded.baseline_json,
                        updated_at = excluded.updated_at
                    """,
                    (user_id, baseline_json, now, now),
                )
                connection.commit()
            return deepcopy(merged)

    def delete_baseline(self, user_id: str) -> None:
        with self._lock:
            if self._database_path is None:
                self._memory_baselines.pop(user_id, None)
                return
            with self._connect() as connection:
                connection.execute("DELETE FROM user_baselines WHERE user_id = ?", (user_id,))
                connection.commit()

    def _get_user_baseline(self, user_id: str) -> dict[str, Any] | None:
        if self._database_path is None:
            baseline = self._memory_baselines.get(user_id)
            return deepcopy(baseline) if baseline is not None else None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT baseline_json FROM user_baselines WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        try:
            baseline = json.loads(row[0])
            baseline["user_id"] = user_id
            return baseline
        except json.JSONDecodeError:
            logger.exception("Stored baseline JSON is invalid for user_id=%s", user_id)
            return None

    def _merge_baseline(self, base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        result = deepcopy(base)
        for key, value in updates.items():
            if key == "user_id" or value is None:
                continue
            if isinstance(result.get(key), dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = deepcopy(value)
        return result

    def _deep_merge(self, base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        result = deepcopy(base)
        for key, value in updates.items():
            if value is None:
                continue
            if isinstance(result.get(key), dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = deepcopy(value)
        return result
