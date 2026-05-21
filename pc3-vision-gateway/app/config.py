from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def default_baseline_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "baseline_default.json"


def default_baseline_db_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "baselines.sqlite3"


def default_app_db_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "app.sqlite3"


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def default_pose_model_path() -> Path:
    return project_root() / "models" / "pose" / "pose_landmarker_lite.task"


def pose_model_path_for_variant(variant: str) -> Path:
    normalized = variant.strip().lower()
    if normalized == "full":
        return project_root() / "models" / "pose" / "pose_landmarker_full.task"
    return default_pose_model_path()


def default_exercise_thresholds_path() -> Path:
    return project_root() / "config" / "exercise_thresholds.json"


def default_exercise_rules_path() -> Path:
    return project_root() / "data" / "exercise_rules.json"


def default_exercise_classifier_path() -> Path:
    return project_root() / "models" / "exercise_classifier" / "exercise_classifier.json"


class Settings(BaseSettings):
    service_name: str = "pc3-vision-gateway"
    pc2_coach_api_url: str = "http://localhost:7000/api/coach/generate"
    pc2_routine_api_url: str = "http://localhost:7000/api/routine/profile"
    pc2_routine_day_api_url: str = "http://localhost:7000/api/routine/profile/{user_id}/day"
    pc2_routine_calendar_api_url: str = "http://localhost:7000/api/routine/profile/{user_id}/calendar"
    pc2_body_metrics_api_url: str = "http://localhost:7000/api/users/{user_id}/body-metrics"
    pc2_progress_api_url: str = "http://localhost:7000/api/users/{user_id}/progress"
    pc2_coach_logs_api_url: str = "http://localhost:7000/api/coach/logs/{user_id}"
    pc2_workout_skip_api_url: str = "http://localhost:7000/api/workouts/skip"
    host: str = "127.0.0.1"
    port: int = 9000
    ws_public_host: str | None = None
    pc2_timeout_seconds: float = 90.0
    cors_allow_origins: str = (
        "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost"
    )
    use_mediapipe_tasks: bool = True
    pose_pipeline_mode: Literal["single", "dual"] = "dual"
    pose_model_variant: Literal["lite", "full"] = "full"
    pose_fast_model_variant: Literal["lite", "full"] = "lite"
    pose_accurate_model_variant: Literal["lite", "full"] = "full"
    pose_model_path: Path | None = None
    pose_fast_model_path: Path | None = None
    pose_accurate_model_path: Path | None = None
    pose_accurate_interval: int = Field(default=1, ge=1, le=30)
    max_poses: int = Field(default=3, ge=1, le=8)
    target_lost_grace_frames: int = Field(default=8, ge=0, le=120)
    min_valid_frame_ratio: float = Field(default=0.55, ge=0.0, le=1.0)
    max_model_disagreement_ratio: float = Field(default=0.30, ge=0.0, le=1.0)
    config_exercise_thresholds: Path = Field(default_factory=default_exercise_thresholds_path)
    exercise_rules_path: Path = Field(default_factory=default_exercise_rules_path)
    exercise_classifier_path: Path = Field(default_factory=default_exercise_classifier_path)
    baseline_path: Path = Field(default_factory=default_baseline_path)
    baseline_db_path: Path = Field(default_factory=default_baseline_db_path)
    app_db_path: Path = Field(default_factory=default_app_db_path)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def ws_host(self) -> str:
        if self.ws_public_host:
            return self.ws_public_host
        if self.host in {"0.0.0.0", "::"}:
            return "localhost"
        return self.host

    def ws_url_for_session(self, session_id: str) -> str:
        return f"ws://{self.ws_host}:{self.port}/ws/sessions/{session_id}"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]

    def resolve_path(self, value: Path) -> Path:
        if value.is_absolute():
            return value
        return project_root() / value

    @property
    def selected_pose_model_path(self) -> Path:
        if self.pose_model_path is not None:
            return self.resolve_path(self.pose_model_path)
        return pose_model_path_for_variant(self.pose_model_variant)

    @property
    def selected_fast_pose_model_path(self) -> Path:
        if self.pose_fast_model_path is not None:
            return self.resolve_path(self.pose_fast_model_path)
        return pose_model_path_for_variant(self.pose_fast_model_variant)

    @property
    def selected_accurate_pose_model_path(self) -> Path:
        if self.pose_accurate_model_path is not None:
            return self.resolve_path(self.pose_accurate_model_path)
        return pose_model_path_for_variant(self.pose_accurate_model_variant)


@lru_cache
def get_settings() -> Settings:
    return Settings()
