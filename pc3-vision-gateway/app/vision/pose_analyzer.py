from __future__ import annotations

from dataclasses import dataclass
import logging
import math
from pathlib import Path
from typing import Any

from app.exercise_types import normalize_exercise_type
from app.schemas.feature import ExerciseFeature
from app.utils.json_loader import load_json_file
from app.vision.exercise_classifier import ExerciseClassifier

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _Point:
    x: float
    y: float


class PoseAnalyzer:
    _LANDMARK_INDEX = {
        "LEFT_SHOULDER": 11,
        "RIGHT_SHOULDER": 12,
        "LEFT_ELBOW": 13,
        "RIGHT_ELBOW": 14,
        "LEFT_WRIST": 15,
        "RIGHT_WRIST": 16,
        "LEFT_HIP": 23,
        "RIGHT_HIP": 24,
        "LEFT_KNEE": 25,
        "RIGHT_KNEE": 26,
        "LEFT_ANKLE": 27,
        "RIGHT_ANKLE": 28,
    }
    _DEFAULT_THRESHOLDS: dict[str, Any] = {
        "squat": {
            "down_knee_angle": 120,
            "up_knee_angle": 160,
            "min_body_height": 0.16,
            "min_confident_landmark_ratio": 0.45,
            "partial_body_margin": 0.01,
            "min_landmark_visibility": 0.35,
            "stability_warning_threshold": 0.65,
            "posture_error_thresholds": {
                "knees_caving_in": 0.12,
                "back_leaning_forward_degrees": 25,
            },
        },
        "pushup": {
            "down_elbow_angle": 115,
            "up_elbow_angle": 145,
            "body_line_min_angle": 150,
            "min_body_height": 0.10,
            "min_confident_landmark_ratio": 0.45,
            "partial_body_margin": 0.01,
            "min_landmark_visibility": 0.35,
            "stability_warning_threshold": 0.65,
        },
        "lunge": {
            "down_knee_angle": 120,
            "up_knee_angle": 155,
            "min_body_height": 0.16,
            "min_confident_landmark_ratio": 0.45,
            "partial_body_margin": 0.01,
            "min_landmark_visibility": 0.35,
            "stability_warning_threshold": 0.65,
            "posture_error_thresholds": {
                "knees_caving_in": 0.14,
                "back_leaning_forward_degrees": 28,
            },
        },
        "knee_raise": {
            "raised_knee_min_height": 0.07,
            "reset_knee_max_height": 0.025,
            "max_count_imbalance": 3,
            "min_body_height": 0.16,
            "min_confident_landmark_ratio": 0.45,
            "partial_body_margin": 0.01,
            "min_landmark_visibility": 0.35,
            "stability_warning_threshold": 0.65,
        },
        "jumping_jack": {
            "open_feet_width_ratio": 1.12,
            "closed_feet_width_ratio": 1.08,
            "arm_raise_margin": -0.05,
            "arm_down_margin": 0.0,
            "min_raised_arm_sides": 1,
            "min_body_height": 0.16,
            "min_confident_landmark_ratio": 0.45,
            "partial_body_margin": 0.01,
            "min_landmark_visibility": 0.35,
            "stability_warning_threshold": 0.65,
        },
    }
    _REQUIRED_LANDMARKS = {
        "squat": [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ],
        "pushup": [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_ELBOW",
            "RIGHT_ELBOW",
            "LEFT_WRIST",
            "RIGHT_WRIST",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ],
        "lunge": [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ],
        "knee_raise": [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ],
        "jumping_jack": [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_WRIST",
            "RIGHT_WRIST",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ],
    }
    _EXERCISE_LABELS = {
        "squat": "스쿼트",
        "pushup": "푸시업",
        "lunge": "런지",
        "knee_raise": "무릎 들어올리기",
        "jumping_jack": "점핑잭",
    }
    _TARGET_LOST_GRACE_FRAMES = 8
    _MODEL_DISAGREEMENT_GRACE_FRAMES = 1
    _TARGET_MATCH_MIN_CONFIDENCE = 0.56

    def __init__(
        self,
        pose_model_path: str | Path | None = None,
        fast_pose_model_path: str | Path | None = None,
        accurate_pose_model_path: str | Path | None = None,
        exercise_thresholds_path: str | Path | None = None,
        exercise_rules_path: str | Path | None = None,
        exercise_classifier_path: str | Path | None = None,
        use_mediapipe_tasks: bool = False,
        pose_pipeline_mode: str = "single",
        accurate_interval: int = 1,
        max_poses: int = 3,
        target_lost_grace_frames: int = 8,
    ) -> None:
        self._thresholds = load_json_file(exercise_thresholds_path, self._DEFAULT_THRESHOLDS)
        self._exercise_rules = load_json_file(exercise_rules_path, {})
        self._exercise_classifier = ExerciseClassifier(exercise_classifier_path)
        self._max_poses = max(1, int(max_poses))
        self._target_lost_grace_frames = max(0, int(target_lost_grace_frames))
        self._pipeline_mode = "dual" if str(pose_pipeline_mode).lower() == "dual" else "single"
        self._accurate_interval = max(1, int(accurate_interval))
        self._frame_index = 0
        self._backend = "fallback"
        self._landmarker = None
        self._fast_landmarker = None
        self._accurate_landmarker = None
        self._mp = None

        if not use_mediapipe_tasks:
            logger.info("USE_MEDIAPIPE_TASKS=false. Pose analysis will use fallback.")
            return
        if cv2 is None:
            logger.warning("OpenCV is unavailable. Pose analysis will use fallback.")
            return
        if pose_model_path is None:
            logger.warning("POSE_MODEL_PATH is not configured. Pose analysis will use fallback.")
            return

        if self._pipeline_mode == "dual":
            fast_path = Path(fast_pose_model_path or pose_model_path)
            accurate_path = Path(accurate_pose_model_path or pose_model_path)
            self._fast_landmarker = self._create_tasks_pose_landmarker(fast_path, "fast")
            self._accurate_landmarker = self._create_tasks_pose_landmarker(accurate_path, "accurate")
            if self._fast_landmarker is not None and self._accurate_landmarker is not None:
                self._landmarker = self._accurate_landmarker
                self._backend = "mediapipe_tasks_dual"
                logger.info(
                    "Dual MediaPipe PoseLandmarker initialized: fast=%s accurate=%s",
                    fast_path,
                    accurate_path,
                )
                return
            fallback_landmarker = self._accurate_landmarker or self._fast_landmarker
            if fallback_landmarker is not None:
                self._landmarker = fallback_landmarker
                self._backend = "mediapipe_tasks"
                logger.warning("Dual pose pipeline is incomplete. Falling back to single MediaPipe mode.")
                return

        self._try_initialize_tasks_pose(Path(pose_model_path))

    @property
    def backend(self) -> str:
        return self._backend

    @property
    def use_mediapipe(self) -> bool:
        return self._backend in {"mediapipe_tasks", "mediapipe_tasks_dual"} and (
            self._landmarker is not None
            or self._fast_landmarker is not None
            or self._accurate_landmarker is not None
        )

    def _try_initialize_tasks_pose(self, pose_model_path: Path) -> bool:
        landmarker = self._create_tasks_pose_landmarker(pose_model_path, "single")
        if landmarker is None:
            self._landmarker = None
            self._backend = "fallback"
            return False
        self._landmarker = landmarker
        self._backend = "mediapipe_tasks"
        logger.info("MediaPipe Tasks PoseLandmarker initialized: %s", pose_model_path)
        return True

    def _create_tasks_pose_landmarker(self, pose_model_path: Path, role: str):
        if not pose_model_path.exists():
            logger.warning("POSE_MODEL_PATH for %s does not exist: %s.", role, pose_model_path)
            return None
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision

            base_options = python.BaseOptions(model_asset_path=str(pose_model_path))
            options = vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                num_poses=self._max_poses,
                min_pose_detection_confidence=self._min_landmark_visibility(),
                min_pose_presence_confidence=self._min_landmark_visibility(),
                min_tracking_confidence=self._min_landmark_visibility(),
                output_segmentation_masks=False,
            )
            self._mp = mp
            return vision.PoseLandmarker.create_from_options(options)
        except Exception:
            logger.exception("Failed to initialize MediaPipe Tasks PoseLandmarker for %s.", role)
            return None

    def analyze(
        self,
        frame,
        previous: ExerciseFeature | None = None,
        exercise_type: str | None = None,
    ) -> tuple[ExerciseFeature, str]:
        exercise_type = normalize_exercise_type(exercise_type or (previous.type if previous else None))
        if previous is None or previous.type != exercise_type:
            previous = ExerciseFeature(type=exercise_type)

        if self._dual_ready():
            return self._analyze_dual(frame, previous, exercise_type)

        detected_landmarks = self._detect_landmarks(frame)
        return self._analyze_detected_landmarks(detected_landmarks, previous, exercise_type)

    def _analyze_dual(
        self,
        frame,
        previous: ExerciseFeature,
        exercise_type: str,
    ) -> tuple[ExerciseFeature, str]:
        self._frame_index += 1
        fast_detected = self._detect_landmarks_with(frame, self._fast_landmarker, "fast")
        fast_feature, fast_feedback = self._analyze_detected_landmarks(
            fast_detected,
            previous,
            exercise_type,
        )
        if self._has_blocking_errors(fast_feature):
            return fast_feature.model_copy(
                update={
                    "measurement_quality": "blocked",
                    "measurement_confidence": 0.0,
                }
            ), fast_feedback

        if self._frame_index % self._accurate_interval != 0:
            return self._mark_fast_only(fast_feature, previous), fast_feedback

        accurate_detected = self._detect_landmarks_with(frame, self._accurate_landmarker, "accurate")
        previous_for_accurate = previous.model_copy(
            update={
                "target_signature": fast_feature.target_signature,
                "classifier_window": previous.classifier_window,
            }
        )
        accurate_feature, accurate_feedback = self._analyze_detected_landmarks(
            accurate_detected,
            previous_for_accurate,
            exercise_type,
        )

        if self._has_blocking_errors(accurate_feature):
            return self._mark_fast_only(
                fast_feature,
                previous,
            ), "정밀 포즈 확인이 불안정해 이번 프레임은 빠른 추적 결과만 사용합니다."

        target_updates = {
            "person_count": fast_feature.person_count,
            "target_status": fast_feature.target_status,
            "target_confidence": min(
                fast_feature.target_confidence or 0.0,
                accurate_feature.target_confidence or 0.0,
            ),
            "target_signature": fast_feature.target_signature,
        }
        accurate_feature = accurate_feature.model_copy(update=target_updates)
        if self._features_disagree(fast_feature, accurate_feature, previous):
            return self._mark_model_disagreement(
                accurate_feature,
                previous,
            ), "두 포즈 모델의 판정이 달라 카운트를 보류했어요. 자세를 또렷하게 유지해 주세요."

        confidence = min(accurate_feature.stability_score, target_updates["target_confidence"])
        return accurate_feature.model_copy(
            update={
                "measurement_quality": "dual_verified",
                "measurement_confidence": round(self._clamp(confidence), 3),
            }
        ), accurate_feedback

    def _analyze_detected_landmarks(
        self,
        detected_landmarks,
        previous: ExerciseFeature,
        exercise_type: str,
    ) -> tuple[ExerciseFeature, str]:
        pose_candidates = self._pose_candidates(detected_landmarks)
        person_count = len(pose_candidates)
        if not pose_candidates:
            if previous.target_signature:
                return self._target_recovering_feature(
                    previous,
                    exercise_type,
                    person_count=0,
                    confidence=0.0,
                    extra_errors=[],
                )
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["no_person"],
                feedback="몸 전체가 화면에 보이도록 카메라 위치와 거리를 맞춰 주세요.",
                clear_phase=False,
                person_count=0,
                target_status="no_person",
                target_confidence=0.0,
                target_lost_frames=0,
            )

        selection = self._select_target_candidate(pose_candidates, previous)
        if selection["landmarks"] is None:
            return self._target_recovering_feature(
                previous,
                exercise_type,
                person_count=person_count,
                confidence=selection["confidence"],
                extra_errors=["multi_person_detected"] if person_count > 1 else [],
            )

        landmarks = selection["landmarks"]
        target_updates = {
            "person_count": person_count,
            "target_status": selection["status"],
            "target_confidence": selection["confidence"],
            "target_signature": selection["signature"],
            "target_lost_frames": 0,
        }
        if not landmarks:
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["no_person"],
                feedback="몸 전체가 화면에 보이도록 카메라 위치와 거리를 맞춰 주세요.",
                clear_phase=False,
                **target_updates,
            )

        required = self._REQUIRED_LANDMARKS.get(exercise_type, self._REQUIRED_LANDMARKS["squat"])
        if self._person_too_far(landmarks, exercise_type):
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["person_too_far"],
                feedback="몸이 너무 작게 보여요. 카메라에 조금 더 가까이 서 주세요.",
                clear_phase=False,
                **self._blocked_target_updates(previous, target_updates),
            )
        if self._has_partial_body(
            landmarks,
            required,
            margin=self._threshold(exercise_type, "partial_body_margin", 0.015),
        ):
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["low_confidence", "partial_body"],
                feedback="몸 전체가 화면 안에 들어오도록 위치를 조정해 주세요.",
                clear_phase=False,
                **self._blocked_target_updates(previous, target_updates),
            )
        if not self._landmarks_are_confident(landmarks, required, exercise_type):
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["low_confidence"],
                feedback="조명과 자세를 조정해 관절이 선명하게 보이게 해 주세요.",
                **self._blocked_target_updates(previous, target_updates),
            )
        try:
            if exercise_type == "pushup":
                feature, feedback = self._analyze_pushup(landmarks, previous)
                return self._finalize_valid_feature(
                    feature, feedback, previous, landmarks, exercise_type, target_updates
                )
            if exercise_type == "lunge":
                feature, feedback = self._analyze_lunge(landmarks, previous)
                return self._finalize_valid_feature(
                    feature, feedback, previous, landmarks, exercise_type, target_updates
                )
            if exercise_type == "knee_raise":
                feature, feedback = self._analyze_knee_raise(landmarks, previous)
                return self._finalize_valid_feature(
                    feature, feedback, previous, landmarks, exercise_type, target_updates
                )
            if exercise_type == "jumping_jack":
                feature, feedback = self._analyze_jumping_jack(landmarks, previous)
                return self._finalize_valid_feature(
                    feature, feedback, previous, landmarks, exercise_type, target_updates
                )
            feature, feedback = self._analyze_squat(landmarks, previous)
            return self._finalize_valid_feature(
                feature, feedback, previous, landmarks, exercise_type, target_updates
            )
        except Exception:
            logger.exception("Pose analysis failed during landmark processing. Returning fallback.")
            return self._idle_feature(
                previous,
                exercise_type,
                posture_errors=["analysis_failed"],
                feedback="자세를 안정적으로 인식하지 못했습니다. 화면 안에서 다시 시도해 주세요.",
            )

    def _analyze_squat(
        self,
        landmarks,
        previous: ExerciseFeature,
    ) -> tuple[ExerciseFeature, str]:
        left_angle = self._knee_angle(landmarks, "LEFT")
        right_angle = self._knee_angle(landmarks, "RIGHT")
        average_angle = (left_angle + right_angle) / 2
        state = self._state_from_angle(
            "squat",
            average_angle,
            down_key="down_knee_angle",
            up_key="up_knee_angle",
            default_down=95,
            default_up=160,
        )
        count, rep_phase = self._count_with_hysteresis(previous, state)

        posture_errors: list[str] = []
        if self._knees_caving_in(landmarks, "squat"):
            posture_errors.append("knees_caving_in")
        trunk_angle = self._trunk_angle(landmarks)
        if trunk_angle > self._back_lean_threshold("squat"):
            posture_errors.append("back_leaning_forward")

        stability_score = self._stability_score(
            asymmetry=abs(left_angle - right_angle),
            trunk_angle=trunk_angle,
            posture_errors=posture_errors,
        )
        squat_depth = self._squat_depth(average_angle, previous.squat_depth)
        feedback = self._feedback("squat", state, posture_errors, stability_score)
        return (
            ExerciseFeature(
                type="squat",
                count=count,
                state=state,
                stability_score=stability_score,
                posture_errors=posture_errors,
                squat_depth=squat_depth,
                knee_angle=round(average_angle, 1),
                back_angle=round(trunk_angle, 1),
                rep_phase=rep_phase,
            ),
            feedback,
        )

    def _analyze_pushup(
        self,
        landmarks,
        previous: ExerciseFeature,
    ) -> tuple[ExerciseFeature, str]:
        left_angle = self._elbow_angle(landmarks, "LEFT")
        right_angle = self._elbow_angle(landmarks, "RIGHT")
        average_angle = (left_angle + right_angle) / 2
        state = self._state_from_angle(
            "pushup",
            average_angle,
            down_key="down_elbow_angle",
            up_key="up_elbow_angle",
            default_down=95,
            default_up=155,
        )
        count, rep_phase = self._count_with_hysteresis(previous, state)

        posture_errors: list[str] = []
        body_line_angle = self._body_line_angle(landmarks)
        body_line_min = self._threshold("pushup", "body_line_min_angle", 160)
        if body_line_angle < body_line_min:
            posture_errors.append("hip_sagging")
        if state == "idle":
            posture_errors.append("partial_range")

        stability_score = self._stability_score(
            asymmetry=abs(left_angle - right_angle),
            trunk_angle=max(0.0, 180.0 - body_line_angle),
            posture_errors=posture_errors,
        )
        feedback = self._feedback("pushup", state, posture_errors, stability_score)
        return (
            ExerciseFeature(
                type="pushup",
                count=count,
                state=state,
                stability_score=stability_score,
                posture_errors=posture_errors,
                knee_angle=round(average_angle, 1),
                back_angle=round(180.0 - body_line_angle, 1),
                rep_phase=rep_phase,
            ),
            feedback,
        )

    def _analyze_lunge(
        self,
        landmarks,
        previous: ExerciseFeature,
    ) -> tuple[ExerciseFeature, str]:
        left_angle = self._knee_angle(landmarks, "LEFT")
        right_angle = self._knee_angle(landmarks, "RIGHT")
        active_side = "LEFT" if left_angle <= right_angle else "RIGHT"
        active_angle = min(left_angle, right_angle)
        up_angle = self._state_threshold("lunge", "up_knee_angle", 160)
        down_angle = self._state_threshold("lunge", "down_knee_angle", 105)
        if active_angle <= down_angle:
            state = "down"
        elif left_angle >= up_angle and right_angle >= up_angle:
            state = "up"
        else:
            state = "idle"

        count, count_left, count_right, rep_phase, pending_side = self._paired_count_with_hysteresis(
            previous,
            state,
            active_side,
        )

        posture_errors: list[str] = []
        if state == "idle":
            posture_errors.append("short_lunge_depth")
        if self._knees_caving_in(landmarks, "lunge"):
            posture_errors.append("knees_caving_in")
        trunk_angle = self._trunk_angle(landmarks)
        if trunk_angle > self._back_lean_threshold("lunge"):
            posture_errors.append("back_leaning_forward")

        stability_score = self._stability_score(
            asymmetry=0,
            trunk_angle=trunk_angle,
            posture_errors=posture_errors,
        )
        feedback = self._feedback("lunge", state, posture_errors, stability_score)
        return (
            ExerciseFeature(
                type="lunge",
                count=count,
                count_left=count_left,
                count_right=count_right,
                state=state,
                stability_score=stability_score,
                posture_errors=posture_errors,
                knee_angle=round(active_angle, 1),
                back_angle=round(trunk_angle, 1),
                rep_phase=rep_phase,
                active_side=pending_side,
            ),
            feedback,
        )

    def _analyze_knee_raise(
        self,
        landmarks,
        previous: ExerciseFeature,
    ) -> tuple[ExerciseFeature, str]:
        left_height = self._knee_raise_height(landmarks, "LEFT")
        right_height = self._knee_raise_height(landmarks, "RIGHT")
        active_side = "LEFT" if left_height >= right_height else "RIGHT"
        active_height = max(left_height, right_height)
        raised_height = self._threshold("knee_raise", "raised_knee_min_height", 0.10)
        reset_height = self._threshold("knee_raise", "reset_knee_max_height", 0.03)

        if active_height >= raised_height:
            state = "up"
        elif left_height <= reset_height and right_height <= reset_height:
            state = "down"
        else:
            state = "idle"

        count, count_left, count_right, rep_phase, pending_side = self._raise_count_with_hysteresis(
            previous,
            state,
            active_side,
        )

        posture_errors: list[str] = []
        if state == "idle" and active_height > reset_height:
            posture_errors.append("low_knee_raise")
        max_imbalance = int(self._threshold("knee_raise", "max_count_imbalance", 2))
        if abs(count_left - count_right) > max_imbalance:
            posture_errors.append("uneven_knee_raise")

        trunk_angle = self._trunk_angle(landmarks)
        active_knee_angle = self._knee_angle(landmarks, active_side)
        stability_score = self._stability_score(
            asymmetry=abs(left_height - right_height) * 100,
            trunk_angle=trunk_angle,
            posture_errors=posture_errors,
        )
        feedback = self._feedback("knee_raise", state, posture_errors, stability_score)
        return (
            ExerciseFeature(
                type="knee_raise",
                count=count,
                count_left=count_left,
                count_right=count_right,
                state=state,
                stability_score=stability_score,
                posture_errors=posture_errors,
                knee_angle=round(active_knee_angle, 1),
                back_angle=round(trunk_angle, 1),
                rep_phase=rep_phase,
                active_side=pending_side,
            ),
            feedback,
        )

    def _analyze_jumping_jack(
        self,
        landmarks,
        previous: ExerciseFeature,
    ) -> tuple[ExerciseFeature, str]:
        shoulder_width = max(self._width(landmarks, "SHOULDER"), 0.01)
        ankle_width = self._width(landmarks, "ANKLE")
        feet_ratio = ankle_width / shoulder_width
        open_ratio = self._threshold("jumping_jack", "open_feet_width_ratio", 1.12)
        closed_ratio = self._threshold("jumping_jack", "closed_feet_width_ratio", 1.08)
        arms_up = self._arms_up(landmarks)
        arms_down = self._arms_down(landmarks)
        feet_open = feet_ratio >= open_ratio
        feet_closed = feet_ratio <= closed_ratio

        if feet_open and arms_up:
            state = "up"
        elif feet_closed and arms_down:
            state = "down"
        else:
            state = "idle"

        count, rep_phase = self._count_with_hysteresis(previous, state)
        posture_errors: list[str] = []
        if feet_open and not arms_up:
            posture_errors.append("arms_not_overhead")
        if arms_up and not feet_open:
            posture_errors.append("feet_not_wide_enough")
        if state == "idle" and (feet_open or arms_up):
            posture_errors.append("unsynced_jumping_jack")

        wrist_y_gap = abs(self._landmark(landmarks, "LEFT", "WRIST").y - self._landmark(landmarks, "RIGHT", "WRIST").y)
        ankle_y_gap = abs(self._landmark(landmarks, "LEFT", "ANKLE").y - self._landmark(landmarks, "RIGHT", "ANKLE").y)
        stability_score = self._score(
            min((wrist_y_gap + ankle_y_gap) * 2, 0.25),
            posture_errors=posture_errors,
        )
        feedback = self._feedback("jumping_jack", state, posture_errors, stability_score)
        return (
            ExerciseFeature(
                type="jumping_jack",
                count=count,
                state=state,
                stability_score=stability_score,
                posture_errors=posture_errors,
                rep_phase=rep_phase,
            ),
            feedback,
        )

    def _idle_feature(
        self,
        previous: ExerciseFeature,
        exercise_type: str,
        posture_errors: list[str],
        feedback: str,
        clear_phase: bool = False,
        **extra_updates,
    ) -> tuple[ExerciseFeature, str]:
        update = {
            "type": exercise_type,
            "state": "idle",
            "posture_errors": posture_errors,
        }
        update.update(extra_updates)
        if clear_phase:
            update["rep_phase"] = None
            update["active_side"] = None
        return (
            previous.model_copy(update=update),
            feedback,
        )

    def _blocked_target_updates(
        self,
        previous: ExerciseFeature,
        target_updates: dict[str, Any],
    ) -> dict[str, Any]:
        if previous.target_signature:
            return target_updates
        updates = dict(target_updates)
        updates["target_status"] = "target_pending"
        updates["target_signature"] = None
        return updates

    def _target_recovering_feature(
        self,
        previous: ExerciseFeature,
        exercise_type: str,
        person_count: int,
        confidence: float,
        extra_errors: list[str] | None = None,
    ) -> tuple[ExerciseFeature, str]:
        lost_frames = previous.target_lost_frames + 1
        extra_errors = extra_errors or []
        if lost_frames <= self._target_lost_grace_frames:
            posture_errors = ["target_recovering", *extra_errors]
            feedback = "사용자를 다시 찾고 있어요. 화면 중앙에서 잠시 멈춰 주세요."
            target_status = "target_recovering"
        else:
            posture_errors = ["target_lost", *extra_errors]
            feedback = "처음 잡은 사용자를 놓쳤어요. 같은 사람이 화면 중앙에 다시 서거나 세션을 다시 시작해 주세요."
            target_status = "target_lost"
        return self._idle_feature(
            previous,
            exercise_type,
            posture_errors=posture_errors,
            feedback=feedback,
            clear_phase=False,
            person_count=person_count,
            target_status=target_status,
            target_confidence=round(max(0.0, confidence), 3),
            target_signature=previous.target_signature,
            target_lost_frames=lost_frames,
            measurement_quality=target_status,
            measurement_confidence=0.0,
        )

    def _count_with_hysteresis(self, previous: ExerciseFeature, state: str) -> tuple[int, str | None]:
        count = previous.count
        phase = previous.rep_phase or (previous.state if previous.state in {"up", "down"} else None)
        if state == "down":
            return count, "down"
        if state == "idle":
            return count, "down" if phase == "down" else phase
        if state == "up" and phase == "down":
            return count + 1, "up"
        if state == "up":
            return count, "up"
        return count, phase

    def _paired_count_with_hysteresis(
        self,
        previous: ExerciseFeature,
        state: str,
        active_side: str,
    ) -> tuple[int, int, int, str | None, str | None]:
        count = previous.count
        count_left = previous.count_left or 0
        count_right = previous.count_right or 0
        phase = previous.rep_phase or (previous.state if previous.state in {"up", "down"} else None)
        pending_side = previous.active_side
        if state == "down":
            return count, count_left, count_right, "down", active_side
        if state == "idle":
            return count, count_left, count_right, "down" if phase == "down" else phase, pending_side
        if state == "up" and phase == "down":
            counted_side = pending_side or active_side
            count += 1
            if counted_side == "LEFT":
                count_left += 1
            else:
                count_right += 1
            return count, count_left, count_right, "up", None
        if state == "up":
            return count, count_left, count_right, "up", None
        return count, count_left, count_right, phase, pending_side

    def _raise_count_with_hysteresis(
        self,
        previous: ExerciseFeature,
        state: str,
        active_side: str,
    ) -> tuple[int, int, int, str | None, str | None]:
        count = previous.count
        count_left = previous.count_left or 0
        count_right = previous.count_right or 0
        phase = previous.rep_phase or (previous.state if previous.state in {"up", "down"} else None)
        pending_side = previous.active_side
        if state == "down":
            return count, count_left, count_right, "down", None
        if state == "idle":
            return count, count_left, count_right, "down" if phase == "down" else phase, pending_side
        if state == "up" and phase == "down":
            count += 1
            if active_side == "LEFT":
                count_left += 1
            else:
                count_right += 1
            return count, count_left, count_right, "up", None
        if state == "up":
            return count, count_left, count_right, "up", None
        return count, count_left, count_right, phase, pending_side

    def _dual_ready(self) -> bool:
        return (
            self._backend == "mediapipe_tasks_dual"
            and self._fast_landmarker is not None
            and self._accurate_landmarker is not None
        )

    def _has_blocking_errors(self, feature: ExerciseFeature) -> bool:
        blocking = {
            "no_person",
            "target_recovering",
            "target_lost",
            "person_too_far",
            "partial_body",
            "low_confidence",
            "multi_person_detected",
            "analysis_failed",
        }
        return any(error in blocking for error in feature.posture_errors)

    def _mark_fast_only(self, feature: ExerciseFeature, previous: ExerciseFeature) -> ExerciseFeature:
        feature = self._prevent_new_count(feature, previous)
        errors = list(feature.posture_errors)
        if "fast_only" not in errors:
            errors.append("fast_only")
        confidence = min(feature.stability_score, feature.target_confidence or 0.0, 0.6)
        return feature.model_copy(
            update={
                "posture_errors": errors,
                "measurement_quality": "fast_only",
                "measurement_confidence": round(self._clamp(confidence), 3),
                "model_disagreement_frames": 0,
            }
        )

    def _mark_model_disagreement(self, feature: ExerciseFeature, previous: ExerciseFeature) -> ExerciseFeature:
        disagreement_frames = previous.model_disagreement_frames + 1
        if disagreement_frames <= self._MODEL_DISAGREEMENT_GRACE_FRAMES:
            confidence = min(feature.stability_score, feature.target_confidence or 0.0, 0.55)
            return feature.model_copy(
                update={
                    "measurement_quality": "dual_check_pending",
                    "measurement_confidence": round(self._clamp(confidence), 3),
                    "model_disagreement_frames": disagreement_frames,
                }
            )
        feature = self._prevent_new_count(feature, previous)
        errors = list(feature.posture_errors)
        if "model_disagreement" not in errors:
            errors.append("model_disagreement")
        return feature.model_copy(
            update={
                "posture_errors": errors,
                "measurement_quality": "model_disagreement",
                "measurement_confidence": 0.0,
                "model_disagreement_frames": disagreement_frames,
            }
        )

    def _prevent_new_count(self, feature: ExerciseFeature, previous: ExerciseFeature) -> ExerciseFeature:
        update: dict[str, Any] = {}
        if feature.count > previous.count:
            update["count"] = previous.count
            update["rep_phase"] = previous.rep_phase
            update["active_side"] = previous.active_side
        if feature.count_left is not None and previous.count_left is not None and feature.count_left > previous.count_left:
            update["count_left"] = previous.count_left
        if feature.count_right is not None and previous.count_right is not None and feature.count_right > previous.count_right:
            update["count_right"] = previous.count_right
        return feature.model_copy(update=update) if update else feature

    def _features_disagree(
        self,
        fast_feature: ExerciseFeature,
        accurate_feature: ExerciseFeature,
        previous: ExerciseFeature,
    ) -> bool:
        active_states = {"up", "down"}
        if fast_feature.state in active_states and accurate_feature.state in active_states:
            if fast_feature.state != accurate_feature.state:
                return True
        fast_counted = fast_feature.count > previous.count
        accurate_counted = accurate_feature.count > previous.count
        return fast_counted != accurate_counted

    def _with_target_and_classification(
        self,
        feature: ExerciseFeature,
        previous: ExerciseFeature,
        landmarks,
        exercise_type: str,
        target_updates: dict[str, Any],
    ) -> ExerciseFeature:
        detected_type, confidence, window = self._exercise_classifier.classify(
            landmarks,
            previous.classifier_window,
        )
        goal_mismatch = detected_type != exercise_type and confidence >= 0.55
        return feature.model_copy(
            update={
                **target_updates,
                "detected_type": detected_type,
                "exercise_confidence": confidence,
                "goal_mismatch": goal_mismatch,
                "classifier_window": window,
                "target_lost_frames": 0,
                "model_disagreement_frames": 0,
            }
        )

    def _finalize_valid_feature(
        self,
        feature: ExerciseFeature,
        feedback: str,
        previous: ExerciseFeature,
        landmarks,
        exercise_type: str,
        target_updates: dict[str, Any],
    ) -> tuple[ExerciseFeature, str]:
        feature = self._with_target_and_classification(
            feature, previous, landmarks, exercise_type, target_updates
        )
        if target_updates.get("target_status") != "multi_person_detected":
            return feature, feedback

        if (feature.target_confidence or 0.0) < 0.7:
            feature = self._prevent_new_count(feature, previous)
        posture_errors = list(feature.posture_errors)
        if "multi_person_detected" not in posture_errors:
            posture_errors.insert(0, "multi_person_detected")
        feature = feature.model_copy(
            update={
                "posture_errors": posture_errors,
                "measurement_quality": "multi_person_detected",
                "measurement_confidence": 0.0,
            }
        )
        return feature, self._feedback(
            exercise_type,
            feature.state,
            ["multi_person_detected"],
            feature.stability_score,
        )

    def _pose_candidates(self, detected_landmarks) -> list:
        if not detected_landmarks:
            return []
        first = detected_landmarks[0]
        if hasattr(first, "x") and hasattr(first, "y"):
            return [detected_landmarks]
        return [candidate for candidate in detected_landmarks if candidate]

    def _select_target_candidate(self, candidates: list, previous: ExerciseFeature) -> dict[str, Any]:
        if not previous.target_signature:
            if len(candidates) > 1:
                return {
                    "landmarks": None,
                    "status": "multi_person_detected",
                    "confidence": 0.0,
                    "signature": None,
                }
            selected = max(candidates, key=self._initial_target_score)
            return {
                "landmarks": selected,
                "status": "target_locked",
                "confidence": 1.0,
                "signature": self._target_signature(selected),
            }

        scored = [
            (self._target_match_confidence(candidate, previous.target_signature), candidate)
            for candidate in candidates
        ]
        confidence, selected = max(scored, key=lambda item: item[0])
        if confidence < self._TARGET_MATCH_MIN_CONFIDENCE:
            return {
                "landmarks": None,
                "status": "target_lost",
                "confidence": round(max(0.0, confidence), 3),
                "signature": previous.target_signature,
            }
        status = "multi_person_detected" if len(candidates) > 1 else "tracking"
        return {
            "landmarks": selected,
            "status": status,
            "confidence": round(confidence, 3),
            "signature": self._target_signature(selected),
        }

    def _match_accurate_target(self, candidates: list, fast_signature: dict[str, float] | None) -> dict[str, Any]:
        if not candidates or fast_signature is None:
            return {
                "landmarks": None,
                "confidence": 0.0,
                "signature": fast_signature,
            }
        scored = [
            (self._target_match_confidence(candidate, fast_signature), candidate)
            for candidate in candidates
        ]
        confidence, selected = max(scored, key=lambda item: item[0])
        if confidence < self._TARGET_MATCH_MIN_CONFIDENCE:
            return {
                "landmarks": None,
                "confidence": round(max(0.0, confidence), 3),
                "signature": fast_signature,
            }
        return {
            "landmarks": selected,
            "confidence": round(confidence, 3),
            "signature": self._target_signature(selected),
        }

    def _target_updates_from_selection(self, selection: dict[str, Any], person_count: int) -> dict[str, Any]:
        return {
            "person_count": person_count,
            "target_status": selection["status"],
            "target_confidence": selection["confidence"],
            "target_signature": selection["signature"],
        }

    def _initial_target_score(self, landmarks) -> float:
        signature = self._target_signature(landmarks)
        center_distance = abs(signature["center_x"] - 0.5)
        return signature["height"] + (signature["width"] * 0.4) - (center_distance * 0.5)

    def _target_match_confidence(self, landmarks, signature: dict[str, float]) -> float:
        current = self._target_signature(landmarks)
        center_delta = math.hypot(
            current["center_x"] - signature["center_x"],
            current["center_y"] - signature["center_y"],
        )
        size_delta = abs(current["height"] - signature["height"]) + abs(current["width"] - signature["width"])
        shoulder_delta = abs(current["shoulder_width"] - signature["shoulder_width"])
        hip_delta = abs(current["hip_width"] - signature["hip_width"])
        keypoint_delta = self._keypoint_distance(landmarks, signature)
        penalty = (
            (center_delta * 0.9)
            + (size_delta * 0.5)
            + (shoulder_delta * 0.35)
            + (hip_delta * 0.35)
            + (keypoint_delta * 0.25)
        )
        return self._clamp(1.0 - penalty)

    def _target_signature(self, landmarks) -> dict[str, float]:
        names = [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_ELBOW",
            "RIGHT_ELBOW",
            "LEFT_WRIST",
            "RIGHT_WRIST",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ]
        points = [landmarks[self._LANDMARK_INDEX[name]] for name in names]
        xs = [point.x for point in points]
        ys = [point.y for point in points]
        shoulder_mid = self._midpoint(landmarks, "SHOULDER")
        hip_mid = self._midpoint(landmarks, "HIP")
        signature = {
            "center_x": (min(xs) + max(xs)) / 2,
            "center_y": (min(ys) + max(ys)) / 2,
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys),
            "torso_center_x": (shoulder_mid.x + hip_mid.x) / 2,
            "torso_center_y": (shoulder_mid.y + hip_mid.y) / 2,
            "shoulder_width": self._width(landmarks, "SHOULDER"),
            "hip_width": self._width(landmarks, "HIP"),
        }
        for name in names:
            landmark = landmarks[self._LANDMARK_INDEX[name]]
            signature[f"{name.lower()}_x"] = landmark.x
            signature[f"{name.lower()}_y"] = landmark.y
        return {key: round(float(value), 4) for key, value in signature.items()}

    def _keypoint_distance(self, landmarks, signature: dict[str, float]) -> float:
        names = [
            "LEFT_SHOULDER",
            "RIGHT_SHOULDER",
            "LEFT_HIP",
            "RIGHT_HIP",
            "LEFT_KNEE",
            "RIGHT_KNEE",
            "LEFT_ANKLE",
            "RIGHT_ANKLE",
        ]
        distances = []
        for name in names:
            landmark = landmarks[self._LANDMARK_INDEX[name]]
            previous_x = signature.get(f"{name.lower()}_x")
            previous_y = signature.get(f"{name.lower()}_y")
            if previous_x is None or previous_y is None:
                continue
            distances.append(math.hypot(landmark.x - previous_x, landmark.y - previous_y))
        return sum(distances) / len(distances) if distances else 0.0

    def _detect_landmarks(self, frame):
        return self._detect_landmarks_with(frame, self._landmarker, "single")

    def _detect_landmarks_with(self, frame, landmarker, role: str):
        if cv2 is None or landmarker is None or self._mp is None:
            return None
        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
            result = landmarker.detect(mp_image)
            if not result.pose_landmarks:
                return None
            return list(result.pose_landmarks)
        except Exception:
            logger.exception("MediaPipe pose inference failed for %s. Returning fallback for this request.", role)
            if role == "single":
                self._backend = "fallback"
                self._landmarker = None
            return None

    def _landmark(self, landmarks, side: str, part: str):
        enum_name = f"{side}_{part}"
        return landmarks[self._LANDMARK_INDEX[enum_name]]

    def _person_too_far(self, landmarks, exercise_type: str) -> bool:
        required_names = self._REQUIRED_LANDMARKS.get(exercise_type, self._REQUIRED_LANDMARKS["squat"])
        points = [landmarks[self._LANDMARK_INDEX[name]] for name in required_names]
        width = max(point.x for point in points) - min(point.x for point in points)
        height = max(point.y for point in points) - min(point.y for point in points)
        person_scale = max(width, height)
        default_height = 0.12 if exercise_type == "pushup" else 0.18
        min_height = max(self._threshold(exercise_type, "min_body_height", default_height), default_height)
        return person_scale < min_height

    def _has_partial_body(self, landmarks, required_names: list[str], margin: float = 0.04) -> bool:
        edge_margin = max(margin, 0.02)
        for name in required_names:
            landmark = landmarks[self._LANDMARK_INDEX[name]]
            if landmark.x <= edge_margin or landmark.x >= 1 - edge_margin:
                return True
            if landmark.y <= edge_margin or landmark.y >= 1 - edge_margin:
                return True
        return False

    def _landmarks_are_confident(
        self,
        landmarks,
        required_names: list[str],
        exercise_type: str,
    ) -> bool:
        min_visibility = self._min_landmark_visibility(exercise_type)
        min_ratio = self._threshold(exercise_type, "min_confident_landmark_ratio", 0.55)
        confident = 0
        for name in required_names:
            landmark = landmarks[self._LANDMARK_INDEX[name]]
            confidence_values = []
            visibility = getattr(landmark, "visibility", None)
            presence = getattr(landmark, "presence", None)
            if visibility is not None:
                confidence_values.append(float(visibility))
            if presence is not None:
                confidence_values.append(float(presence))
            if not confidence_values or min(confidence_values) >= min_visibility:
                confident += 1

        required_count = max(3, math.ceil(len(required_names) * min_ratio))
        if confident < required_count:
            return False

        core_names = [name for name in required_names if name.endswith(("SHOULDER", "HIP", "KNEE"))]
        core_confident = 0
        for name in core_names:
            landmark = landmarks[self._LANDMARK_INDEX[name]]
            confidence_values = []
            visibility = getattr(landmark, "visibility", None)
            presence = getattr(landmark, "presence", None)
            if visibility is not None:
                confidence_values.append(float(visibility))
            if presence is not None:
                confidence_values.append(float(presence))
            if not confidence_values or min(confidence_values) >= min_visibility:
                core_confident += 1
        return not core_names or core_confident >= max(2, math.ceil(len(core_names) * 0.5))

    def _knee_angle(self, landmarks, side: str) -> float:
        hip = self._landmark(landmarks, side, "HIP")
        knee = self._landmark(landmarks, side, "KNEE")
        ankle = self._landmark(landmarks, side, "ANKLE")
        return self._angle(hip, knee, ankle)

    def _elbow_angle(self, landmarks, side: str) -> float:
        shoulder = self._landmark(landmarks, side, "SHOULDER")
        elbow = self._landmark(landmarks, side, "ELBOW")
        wrist = self._landmark(landmarks, side, "WRIST")
        return self._angle(shoulder, elbow, wrist)

    def _angle(self, point_a, point_b, point_c) -> float:
        vector_a = (point_a.x - point_b.x, point_a.y - point_b.y)
        vector_c = (point_c.x - point_b.x, point_c.y - point_b.y)
        dot = vector_a[0] * vector_c[0] + vector_a[1] * vector_c[1]
        mag_a = math.sqrt(vector_a[0] ** 2 + vector_a[1] ** 2)
        mag_c = math.sqrt(vector_c[0] ** 2 + vector_c[1] ** 2)
        if mag_a == 0 or mag_c == 0:
            return 180.0
        cosine = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
        return math.degrees(math.acos(cosine))

    def _state_from_angle(
        self,
        exercise_type: str,
        angle: float,
        down_key: str,
        up_key: str,
        default_down: float,
        default_up: float,
    ) -> str:
        down_angle = self._state_threshold(exercise_type, down_key, default_down)
        up_angle = self._state_threshold(exercise_type, up_key, default_up)
        if angle <= down_angle:
            return "down"
        if angle >= up_angle:
            return "up"
        return "idle"

    def _knees_caving_in(self, landmarks, exercise_type: str) -> bool:
        left_knee = self._landmark(landmarks, "LEFT", "KNEE")
        right_knee = self._landmark(landmarks, "RIGHT", "KNEE")
        left_ankle = self._landmark(landmarks, "LEFT", "ANKLE")
        right_ankle = self._landmark(landmarks, "RIGHT", "ANKLE")
        knee_width = abs(right_knee.x - left_knee.x)
        ankle_width = abs(right_ankle.x - left_ankle.x)
        return ankle_width > 0.02 and (ankle_width - knee_width) > self._knees_caving_threshold(exercise_type)

    def _trunk_angle(self, landmarks) -> float:
        shoulder_mid = self._midpoint(landmarks, "SHOULDER")
        hip_mid = self._midpoint(landmarks, "HIP")
        dx = shoulder_mid.x - hip_mid.x
        dy = shoulder_mid.y - hip_mid.y
        if dx == 0 and dy == 0:
            return 0.0
        return abs(math.degrees(math.atan2(abs(dx), abs(dy))))

    def _body_line_angle(self, landmarks) -> float:
        shoulder_mid = self._midpoint(landmarks, "SHOULDER")
        hip_mid = self._midpoint(landmarks, "HIP")
        ankle_mid = self._midpoint(landmarks, "ANKLE")
        return self._angle(shoulder_mid, hip_mid, ankle_mid)

    def _knee_raise_height(self, landmarks, side: str) -> float:
        hip = self._landmark(landmarks, side, "HIP")
        knee = self._landmark(landmarks, side, "KNEE")
        return hip.y - knee.y

    def _arms_up(self, landmarks) -> bool:
        margin = self._threshold("jumping_jack", "arm_raise_margin", -0.05)
        left_wrist = self._landmark(landmarks, "LEFT", "WRIST")
        right_wrist = self._landmark(landmarks, "RIGHT", "WRIST")
        left_shoulder = self._landmark(landmarks, "LEFT", "SHOULDER")
        right_shoulder = self._landmark(landmarks, "RIGHT", "SHOULDER")
        raised_sides = int(left_wrist.y < left_shoulder.y - margin) + int(
            right_wrist.y < right_shoulder.y - margin
        )
        required_sides = int(self._threshold("jumping_jack", "min_raised_arm_sides", 1))
        return raised_sides >= max(1, min(required_sides, 2))

    def _arms_down(self, landmarks) -> bool:
        margin = self._threshold("jumping_jack", "arm_down_margin", 0.0)
        left_wrist = self._landmark(landmarks, "LEFT", "WRIST")
        right_wrist = self._landmark(landmarks, "RIGHT", "WRIST")
        left_shoulder = self._landmark(landmarks, "LEFT", "SHOULDER")
        right_shoulder = self._landmark(landmarks, "RIGHT", "SHOULDER")
        return left_wrist.y > left_shoulder.y + margin and right_wrist.y > right_shoulder.y + margin

    def _width(self, landmarks, part: str) -> float:
        left = self._landmark(landmarks, "LEFT", part)
        right = self._landmark(landmarks, "RIGHT", part)
        return abs(right.x - left.x)

    def _midpoint(self, landmarks, part: str) -> _Point:
        left = self._landmark(landmarks, "LEFT", part)
        right = self._landmark(landmarks, "RIGHT", part)
        return _Point((left.x + right.x) / 2, (left.y + right.y) / 2)

    def _squat_depth(self, knee_angle: float, previous_depth: float | None) -> float:
        down_angle = self._state_threshold("squat", "down_knee_angle", 95)
        up_angle = self._state_threshold("squat", "up_knee_angle", 160)
        depth = self._clamp((up_angle - knee_angle) / max(up_angle - down_angle, 1.0))
        return round(max(previous_depth or 0.0, depth), 3)

    def _stability_score(
        self,
        asymmetry: float,
        trunk_angle: float,
        posture_errors: list[str],
    ) -> float:
        asymmetry_penalty = min(asymmetry / 120, 0.3)
        trunk_penalty = min(trunk_angle / 120, 0.25)
        return self._score(asymmetry_penalty, trunk_penalty, posture_errors=posture_errors)

    def _score(self, *penalties: float, posture_errors: list[str]) -> float:
        error_penalty = min(len(posture_errors) * 0.18, 0.36)
        total_penalty = sum(penalties) + error_penalty
        return round(max(0.0, min(1.0, 0.95 - total_penalty)), 3)

    def _feedback(
        self,
        exercise_type: str,
        state: str,
        posture_errors: list[str],
        stability_score: float,
    ) -> str:
        feedback_by_error = {
            "target_recovering": "사용자를 다시 찾고 있어요. 화면 중앙에서 잠시 멈춰 주세요.",
            "target_lost": "처음 잡은 사용자를 놓쳤어요. 같은 사람이 화면 중앙에 다시 서거나 세션을 다시 시작해 주세요.",
            "multi_person_detected": "다른 사람이 함께 잡혔어요. 운동하는 사람만 화면에 들어오게 해 주세요.",
            "person_too_far": "몸이 너무 작게 보여요. 카메라에 조금 더 가까이 서 주세요.",
            "partial_body": "몸 전체가 화면 안에 들어오도록 위치를 조정해 주세요.",
            "low_confidence": "조명과 자세를 조정해 관절이 선명하게 보이게 해 주세요.",
            "model_disagreement": "두 포즈 모델의 판정이 달라 카운트를 보류했어요. 자세를 또렷하게 유지해 주세요.",
            "knees_caving_in": "무릎이 안쪽으로 모이지 않게 발끝 방향과 맞춰 주세요.",
            "back_leaning_forward": "상체를 세우고 중심을 천천히 안정시켜 주세요.",
            "hip_sagging": "엉덩이가 처지지 않게 몸통을 일직선으로 유지해 주세요.",
            "partial_range": "동작 범위를 조금 더 크게 가져가 주세요.",
            "short_lunge_depth": "런지 깊이를 조금 더 낮추고 중심을 안정시켜 주세요.",
            "low_knee_raise": "무릎을 골반 높이까지 더 끌어올려 주세요.",
            "uneven_knee_raise": "좌우 무릎 들어올리기 횟수를 균형 있게 맞춰 주세요.",
            "arms_not_overhead": "팔을 머리 위까지 확실히 올려 주세요.",
            "feet_not_wide_enough": "발을 어깨너비보다 충분히 넓게 벌려 주세요.",
            "unsynced_jumping_jack": "팔과 다리를 같은 타이밍으로 움직여 주세요.",
        }
        for error in posture_errors:
            if error in feedback_by_error:
                return feedback_by_error[error]
        if stability_score < self._stability_warning_threshold(exercise_type):
            return "속도를 줄이고 자세를 안정적으로 유지해 주세요."
        label = self._EXERCISE_LABELS.get(exercise_type, "운동")
        if state == "down":
            return f"{label} 하강 자세 좋아요. 천천히 올라오세요."
        if state == "up":
            return f"{label} 상승 자세 좋아요. 다음 반복을 준비하세요."
        return f"{label} 자세를 화면 중앙에서 천천히 이어가 주세요."

    def _exercise_thresholds(self, exercise_type: str) -> dict[str, Any]:
        return self._thresholds.get(exercise_type, self._thresholds.get("squat", {}))

    def _posture_thresholds(self, exercise_type: str) -> dict[str, Any]:
        return self._exercise_thresholds(exercise_type).get("posture_error_thresholds", {})

    def _threshold(self, exercise_type: str, key: str, default: float) -> float:
        return float(self._exercise_thresholds(exercise_type).get(key, default))

    def _state_threshold(self, exercise_type: str, key: str, default: float) -> float:
        state_thresholds = (
            self._exercise_rules.get("exercises", {})
            .get(exercise_type, {})
            .get("state_thresholds", {})
        )
        return float(state_thresholds.get(key, self._exercise_thresholds(exercise_type).get(key, default)))

    def _min_landmark_visibility(self, exercise_type: str = "squat") -> float:
        thresholds = self._exercise_thresholds(exercise_type)
        return float(thresholds.get("min_landmark_visibility", thresholds.get("min_landmark_confidence", 0.5)))

    def _stability_warning_threshold(self, exercise_type: str) -> float:
        return self._threshold(exercise_type, "stability_warning_threshold", 0.65)

    def _knees_caving_threshold(self, exercise_type: str) -> float:
        return float(
            self._posture_thresholds(exercise_type).get(
                "knees_caving_in",
                self._exercise_thresholds(exercise_type).get("knees_caving_in", 0.12),
            )
        )

    def _back_lean_threshold(self, exercise_type: str) -> float:
        return float(self._posture_thresholds(exercise_type).get("back_leaning_forward_degrees", 25))

    def _clamp(self, value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
        return max(minimum, min(maximum, value))

    def validate_body_baseline(self, frame) -> dict[str, Any]:
        detected = (
            self._detect_landmarks_with(frame, self._fast_landmarker, "fast")
            if self._dual_ready()
            else self._detect_landmarks(frame)
        )
        candidates = self._pose_candidates(detected)
        if not candidates:
            return {
                "valid": False,
                "reason": "전신이 보이지 않아요. 머리부터 발끝까지 화면 안에 들어오게 맞춰 주세요.",
                "errors": ["no_person"],
                "proportions": None,
            }

        fast_landmarks = max(candidates, key=self._initial_target_score)
        fast_errors = self._baseline_landmark_errors(fast_landmarks)
        if fast_errors:
            return {
                "valid": False,
                "reason": self._baseline_reason(fast_errors),
                "errors": fast_errors,
                "proportions": None,
            }

        selected_landmarks = fast_landmarks
        if self._dual_ready():
            accurate_candidates = self._pose_candidates(
                self._detect_landmarks_with(frame, self._accurate_landmarker, "accurate")
            )
            accurate_selection = self._match_accurate_target(
                accurate_candidates,
                self._target_signature(fast_landmarks),
            )
            if accurate_selection["landmarks"] is None:
                return {
                    "valid": False,
                    "reason": self._baseline_reason(["model_disagreement"]),
                    "errors": ["model_disagreement"],
                    "proportions": None,
                }
            accurate_errors = self._baseline_landmark_errors(accurate_selection["landmarks"])
            if accurate_errors:
                return {
                    "valid": False,
                    "reason": self._baseline_reason(accurate_errors),
                    "errors": accurate_errors,
                    "proportions": None,
                }
            selected_landmarks = accurate_selection["landmarks"]

        return {
            "valid": True,
            "reason": None,
            "errors": [],
            "proportions": self._body_proportions_from_landmarks(selected_landmarks),
        }

    def _baseline_landmark_errors(self, landmarks) -> list[str]:
        required = self._REQUIRED_LANDMARKS["squat"]
        if self._person_too_far(landmarks, "squat"):
            return ["person_too_far"]
        if self._has_partial_body(landmarks, required):
            return ["low_confidence", "partial_body"]
        if not self._landmarks_are_confident(landmarks, required, "squat"):
            return ["low_confidence"]
        return []

    def _baseline_reason(self, errors: list[str]) -> str:
        if "person_too_far" in errors:
            return "몸이 너무 작게 보여요. 전신이 보이는 상태에서 카메라에 조금 더 가까이 서 주세요."
        if "partial_body" in errors:
            return "전신이 보이지 않아요. 머리, 몸통, 무릎, 발끝이 모두 화면 안에 들어오게 해 주세요."
        if "model_disagreement" in errors:
            return "포즈 확인 결과가 서로 달라요. 전신이 보이게 선 뒤 잠시 멈춰 주세요."
        if "low_confidence" in errors:
            return "관절 인식이 불안정해요. 조명을 밝게 하고 팔과 다리가 잘 보이게 해 주세요."
        return "전신이 보이지 않아요. 카메라가 몸 전체를 볼 수 있게 위치를 맞춰 주세요."

    def _body_proportions_from_landmarks(self, landmarks) -> dict[str, float]:
        shoulder_width = round(self._width(landmarks, "SHOULDER"), 4)
        hip_width = round(self._width(landmarks, "HIP"), 4)
        shoulder_mid = self._midpoint(landmarks, "SHOULDER")
        ankle_mid = self._midpoint(landmarks, "ANKLE")
        body_height = round(abs(ankle_mid.y - shoulder_mid.y), 4)
        return {
            "shoulder_width": shoulder_width,
            "hip_width": hip_width,
            "body_height": body_height,
        }

    def extract_body_proportions(self, frame) -> dict[str, float] | None:
        landmarks = self._detect_landmarks(frame)
        candidates = self._pose_candidates(landmarks)
        if not candidates:
            return None
        landmarks = max(candidates, key=self._initial_target_score)
        if not self._landmarks_are_confident(
            landmarks,
            self._REQUIRED_LANDMARKS["squat"],
            "squat",
        ):
            return None

        try:
            return self._body_proportions_from_landmarks(landmarks)
        except Exception:
            logger.exception("Failed to extract body proportions from landmarks.")
            return None
