from __future__ import annotations

from app.baseline.baseline_service import BaselineService
from app.baseline.baseline_store import BaselineStore
from app.config import get_settings
from app.features.feature_builder import FeatureBuilder
from app.llm_client.coach_client import CoachClient
from app.sensors.sensor_service import SensorService
from app.storage.app_store import AppStore
from app.storage.memory_store import MemoryStore
from app.vision.pose_analyzer import PoseAnalyzer


settings = get_settings()
store = MemoryStore()
app_store = AppStore(settings.resolve_path(settings.app_db_path))
sensor_service = SensorService(store)
baseline_service = BaselineService(
    BaselineStore(
        settings.resolve_path(settings.baseline_path),
        settings.resolve_path(settings.baseline_db_path),
    )
)
coach_client = CoachClient(settings)
feature_builder = FeatureBuilder(sensor_service, baseline_service)
pose_analyzer = PoseAnalyzer(
    pose_model_path=settings.selected_pose_model_path,
    fast_pose_model_path=settings.selected_fast_pose_model_path,
    accurate_pose_model_path=settings.selected_accurate_pose_model_path,
    exercise_thresholds_path=settings.resolve_path(settings.config_exercise_thresholds),
    exercise_rules_path=settings.resolve_path(settings.exercise_rules_path),
    exercise_classifier_path=settings.resolve_path(settings.exercise_classifier_path),
    use_mediapipe_tasks=settings.use_mediapipe_tasks,
    pose_pipeline_mode=settings.pose_pipeline_mode,
    accurate_interval=settings.pose_accurate_interval,
    max_poses=settings.max_poses,
    target_lost_grace_frames=settings.target_lost_grace_frames,
)
def get_store() -> MemoryStore:
    return store


def get_app_store() -> AppStore:
    return app_store


def get_sensor_service() -> SensorService:
    return sensor_service


def get_baseline_service() -> BaselineService:
    return baseline_service


def get_coach_client() -> CoachClient:
    return coach_client


def get_feature_builder() -> FeatureBuilder:
    return feature_builder


def get_pose_analyzer() -> PoseAnalyzer:
    return pose_analyzer
