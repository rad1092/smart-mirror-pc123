from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pytest

from app.schemas.feature import ExerciseFeature
from app.vision.exercise_classifier import ExerciseClassifier
from app.vision.pose_analyzer import PoseAnalyzer


@dataclass
class Landmark:
    x: float
    y: float
    visibility: float = 1.0
    presence: float = 1.0


def _blank_frame():
    return np.zeros((240, 240, 3), dtype=np.uint8)


def _base_landmarks() -> list[Landmark]:
    landmarks = [Landmark(0.5, 0.5) for _ in range(33)]
    landmarks[11] = Landmark(0.42, 0.25)  # left shoulder
    landmarks[12] = Landmark(0.58, 0.25)  # right shoulder
    landmarks[13] = Landmark(0.40, 0.40)  # left elbow
    landmarks[14] = Landmark(0.60, 0.40)  # right elbow
    landmarks[15] = Landmark(0.40, 0.55)  # left wrist
    landmarks[16] = Landmark(0.60, 0.55)  # right wrist
    landmarks[23] = Landmark(0.44, 0.50)  # left hip
    landmarks[24] = Landmark(0.56, 0.50)  # right hip
    landmarks[25] = Landmark(0.44, 0.70)  # left knee
    landmarks[26] = Landmark(0.56, 0.70)  # right knee
    landmarks[27] = Landmark(0.44, 0.90)  # left ankle
    landmarks[28] = Landmark(0.56, 0.90)  # right ankle
    return landmarks


def _squat_landmarks(state: str) -> list[Landmark]:
    landmarks = _base_landmarks()
    if state == "down":
        landmarks[27] = Landmark(0.58, 0.70)
        landmarks[28] = Landmark(0.42, 0.70)
    elif state == "idle":
        landmarks[27] = Landmark(0.50, 0.84)
        landmarks[28] = Landmark(0.50, 0.84)
    return landmarks


def _pushup_landmarks(state: str) -> list[Landmark]:
    landmarks = _base_landmarks()
    if state == "down":
        for offset, side in [(0.0, "left"), (0.04, "right")]:
            y = 0.45 + offset
            shoulder_index = 11 if side == "left" else 12
            elbow_index = 13 if side == "left" else 14
            wrist_index = 15 if side == "left" else 16
            hip_index = 23 if side == "left" else 24
            ankle_index = 27 if side == "left" else 28
            landmarks[shoulder_index] = Landmark(0.35, y)
            landmarks[elbow_index] = Landmark(0.50, y + 0.18)
            landmarks[wrist_index] = Landmark(0.65, y)
            landmarks[hip_index] = Landmark(0.50, y)
            landmarks[ankle_index] = Landmark(0.85, y)
    elif state == "idle":
        for offset, side in [(0.0, "left"), (0.04, "right")]:
            y = 0.45 + offset
            shoulder_index = 11 if side == "left" else 12
            elbow_index = 13 if side == "left" else 14
            wrist_index = 15 if side == "left" else 16
            hip_index = 23 if side == "left" else 24
            ankle_index = 27 if side == "left" else 28
            landmarks[shoulder_index] = Landmark(0.32, y)
            landmarks[elbow_index] = Landmark(0.50, y + 0.08)
            landmarks[wrist_index] = Landmark(0.68, y)
            landmarks[hip_index] = Landmark(0.48, y)
            landmarks[ankle_index] = Landmark(0.85, y)
    else:
        for offset, side in [(0.0, "left"), (0.04, "right")]:
            y = 0.45 + offset
            shoulder_index = 11 if side == "left" else 12
            elbow_index = 13 if side == "left" else 14
            wrist_index = 15 if side == "left" else 16
            hip_index = 23 if side == "left" else 24
            ankle_index = 27 if side == "left" else 28
            landmarks[shoulder_index] = Landmark(0.30, y)
            landmarks[elbow_index] = Landmark(0.50, y)
            landmarks[wrist_index] = Landmark(0.70, y)
            landmarks[hip_index] = Landmark(0.46, y)
            landmarks[ankle_index] = Landmark(0.85, y)
    return landmarks


def _lunge_landmarks(state: str) -> list[Landmark]:
    landmarks = _base_landmarks()
    if state == "down_left":
        landmarks[23] = Landmark(0.42, 0.45)
        landmarks[25] = Landmark(0.42, 0.65)
        landmarks[27] = Landmark(0.58, 0.65)
        landmarks[24] = Landmark(0.58, 0.45)
        landmarks[26] = Landmark(0.58, 0.70)
        landmarks[28] = Landmark(0.58, 0.90)
    elif state == "idle_left":
        landmarks[23] = Landmark(0.42, 0.45)
        landmarks[25] = Landmark(0.42, 0.65)
        landmarks[27] = Landmark(0.50, 0.82)
        landmarks[24] = Landmark(0.58, 0.45)
        landmarks[26] = Landmark(0.58, 0.70)
        landmarks[28] = Landmark(0.58, 0.90)
    return landmarks


def _small_person_landmarks() -> list[Landmark]:
    landmarks = _base_landmarks()
    for index in [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]:
        landmark = landmarks[index]
        landmarks[index] = Landmark(
            x=0.5 + (landmark.x - 0.5) * 0.25,
            y=0.5 + (landmark.y - 0.5) * 0.25,
        )
    return landmarks


def _partial_body_landmarks() -> list[Landmark]:
    landmarks = _base_landmarks()
    landmarks[27] = Landmark(0.98, 0.90)
    return landmarks


def _shift_landmarks(landmarks: list[Landmark], dx: float, dy: float = 0.0) -> list[Landmark]:
    return [
        Landmark(
            max(0.0, min(1.0, landmark.x + dx)),
            max(0.0, min(1.0, landmark.y + dy)),
            landmark.visibility,
            landmark.presence,
        )
        for landmark in landmarks
    ]


def _knee_raise_landmarks(state: str) -> list[Landmark]:
    landmarks = _base_landmarks()
    if state == "left_up":
        landmarks[25] = Landmark(0.44, 0.35)
        landmarks[27] = Landmark(0.44, 0.58)
        landmarks[26] = Landmark(0.56, 0.55)
        landmarks[28] = Landmark(0.56, 0.75)
    return landmarks


def _jumping_jack_landmarks(state: str) -> list[Landmark]:
    landmarks = _base_landmarks()
    landmarks[11] = Landmark(0.40, 0.30)
    landmarks[12] = Landmark(0.60, 0.30)
    if state == "open":
        landmarks[15] = Landmark(0.25, 0.15)
        landmarks[16] = Landmark(0.75, 0.15)
        landmarks[27] = Landmark(0.20, 0.88)
        landmarks[28] = Landmark(0.80, 0.88)
    else:
        landmarks[15] = Landmark(0.45, 0.55)
        landmarks[16] = Landmark(0.55, 0.55)
        landmarks[27] = Landmark(0.47, 0.90)
        landmarks[28] = Landmark(0.53, 0.90)
    return landmarks


def _analyzer_with_landmarks(monkeypatch, landmarks: list[Landmark]) -> PoseAnalyzer:
    analyzer = PoseAnalyzer(
        exercise_thresholds_path=Path("config/exercise_thresholds.json"),
        exercise_rules_path=Path("data/exercise_rules.json"),
        use_mediapipe_tasks=False,
    )
    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: landmarks)
    return analyzer


def _dual_analyzer(monkeypatch, fast_landmarks, accurate_landmarks) -> PoseAnalyzer:
    analyzer = PoseAnalyzer(
        exercise_thresholds_path=Path("config/exercise_thresholds.json"),
        exercise_rules_path=Path("data/exercise_rules.json"),
        use_mediapipe_tasks=False,
        pose_pipeline_mode="dual",
    )
    analyzer._backend = "mediapipe_tasks_dual"
    analyzer._fast_landmarker = object()
    analyzer._accurate_landmarker = object()

    def detect(frame, landmarker, role):
        if role == "fast":
            return fast_landmarks
        return accurate_landmarks

    monkeypatch.setattr(analyzer, "_detect_landmarks_with", detect)
    return analyzer


def test_pose_analyzer_uses_fallback_when_tasks_disabled():
    analyzer = PoseAnalyzer(use_mediapipe_tasks=False)

    feature, feedback = analyzer.analyze(_blank_frame())

    assert analyzer.backend == "fallback"
    assert feature.state == "idle"
    assert "몸 전체가 화면에 보이도록" in feedback
    assert _has_no_mojibake(feedback)


def test_pose_analyzer_falls_back_when_tasks_enabled_but_model_missing(tmp_path):
    analyzer = PoseAnalyzer(
        pose_model_path=tmp_path / "missing.task",
        use_mediapipe_tasks=True,
    )

    assert analyzer.backend == "fallback"


def test_squat_counts_down_to_up_transition_and_exports_metrics(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _squat_landmarks("down"))
    down_feature, down_feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="up"),
        exercise_type="squat",
    )
    assert down_feature.state == "down"
    assert down_feature.count == 0
    assert down_feature.knee_angle is not None
    assert down_feature.squat_depth is not None
    assert _has_no_mojibake(down_feedback)

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _squat_landmarks("up"))
    up_feature, up_feedback = analyzer.analyze(_blank_frame(), down_feature, exercise_type="squat")

    assert up_feature.state == "up"
    assert up_feature.count == 1
    assert up_feature.squat_depth == down_feature.squat_depth
    assert _has_no_mojibake(up_feedback)


def test_squat_counts_down_idle_up_hysteresis(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _squat_landmarks("down"))
    down_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="up"),
        exercise_type="squat",
    )
    assert down_feature.state == "down"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _squat_landmarks("idle"))
    idle_feature, _ = analyzer.analyze(_blank_frame(), down_feature, exercise_type="squat")
    assert idle_feature.state == "idle"
    assert idle_feature.count == 0
    assert idle_feature.rep_phase == "down"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _squat_landmarks("up"))
    up_feature, _ = analyzer.analyze(_blank_frame(), idle_feature, exercise_type="squat")
    assert up_feature.state == "up"
    assert up_feature.count == 1
    assert up_feature.rep_phase == "up"


def test_dual_pose_counts_when_fast_and_accurate_agree(monkeypatch):
    analyzer = _dual_analyzer(monkeypatch, _squat_landmarks("up"), _squat_landmarks("up"))

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    assert feature.count == 1
    assert feature.measurement_quality == "dual_verified"
    assert feature.measurement_confidence and feature.measurement_confidence > 0
    assert "model_disagreement" not in feature.posture_errors
    assert _has_no_mojibake(feedback)


def test_dual_pose_blocks_count_when_models_disagree(monkeypatch):
    analyzer = _dual_analyzer(monkeypatch, _squat_landmarks("up"), _squat_landmarks("down"))

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    assert feature.count == 0
    assert feature.measurement_quality == "dual_check_pending"
    assert "model_disagreement" not in feature.posture_errors
    assert "두 포즈 모델" in feedback

    blocked_feature, _ = analyzer.analyze(_blank_frame(), feature, exercise_type="squat")

    assert blocked_feature.count == 0
    assert blocked_feature.measurement_quality == "model_disagreement"
    assert "model_disagreement" in blocked_feature.posture_errors


def test_dual_pose_keeps_fast_only_but_does_not_confirm_count_when_full_fails(monkeypatch):
    analyzer = _dual_analyzer(monkeypatch, _squat_landmarks("up"), None)

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    assert feature.count == 0
    assert feature.measurement_quality == "fast_only"
    assert "fast_only" in feature.posture_errors
    assert "빠른 추적" in feedback


def test_pushup_counts_elbow_down_to_up_transition(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _pushup_landmarks("down"))
    down_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="pushup", count=0, state="up"),
        exercise_type="pushup",
    )
    assert down_feature.type == "pushup"
    assert down_feature.state == "down"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _pushup_landmarks("up"))
    up_feature, feedback = analyzer.analyze(_blank_frame(), down_feature, exercise_type="pushup")

    assert up_feature.state == "up"
    assert up_feature.count == 1
    assert up_feature.knee_angle is not None
    assert up_feature.back_angle is not None
    assert _has_no_mojibake(feedback)


def test_pushup_counts_down_idle_up_hysteresis(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _pushup_landmarks("down"))
    down_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="pushup", count=0, state="up"),
        exercise_type="pushup",
    )
    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _pushup_landmarks("idle"))
    idle_feature, _ = analyzer.analyze(_blank_frame(), down_feature, exercise_type="pushup")
    assert idle_feature.state == "idle"
    assert idle_feature.rep_phase == "down"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _pushup_landmarks("up"))
    up_feature, _ = analyzer.analyze(_blank_frame(), idle_feature, exercise_type="pushup")
    assert up_feature.count == 1


def test_lunge_counts_left_side_at_bottom(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _lunge_landmarks("down_left"))

    down_feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="lunge", count=0, count_left=0, count_right=0, state="up"),
        exercise_type="lunge",
    )

    assert down_feature.type == "lunge"
    assert down_feature.state == "down"
    assert down_feature.count == 0
    assert down_feature.count_left == 0
    assert down_feature.count_right == 0
    assert down_feature.active_side == "LEFT"
    assert down_feature.knee_angle is not None
    assert _has_no_mojibake(feedback)


def test_lunge_counts_down_idle_up_hysteresis(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _lunge_landmarks("down_left"))
    down_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="lunge", count=0, count_left=0, count_right=0, state="up"),
        exercise_type="lunge",
    )

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _lunge_landmarks("idle_left"))
    idle_feature, _ = analyzer.analyze(_blank_frame(), down_feature, exercise_type="lunge")
    assert idle_feature.state == "idle"
    assert idle_feature.rep_phase == "down"
    assert idle_feature.active_side == "LEFT"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: _lunge_landmarks("up"))
    up_feature, _ = analyzer.analyze(_blank_frame(), idle_feature, exercise_type="lunge")
    assert up_feature.count == 1
    assert up_feature.count_left == 1
    assert up_feature.count_right == 0


def test_small_person_is_blocked_as_too_far(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _small_person_landmarks())

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="idle"),
        exercise_type="squat",
    )

    assert feature.state == "idle"
    assert feature.count == 0
    assert feature.posture_errors == ["person_too_far"]
    assert "가까이" in feedback


def test_partial_body_is_blocked_as_low_confidence(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _partial_body_landmarks())

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=2, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    assert feature.state == "idle"
    assert feature.count == 2
    assert feature.rep_phase == "down"
    assert feature.posture_errors == ["low_confidence", "partial_body"]
    assert "화면 안" in feedback


def test_knee_raise_counts_left_and_keeps_side_counts(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _knee_raise_landmarks("left_up"))

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="knee_raise", count=0, count_left=0, count_right=0, state="down"),
        exercise_type="knee_raise",
    )

    assert feature.type == "knee_raise"
    assert feature.state == "up"
    assert feature.count == 1
    assert feature.count_left == 1
    assert feature.count_right == 0
    assert _has_no_mojibake(feedback)


def test_jumping_jack_counts_closed_to_open_transition(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _jumping_jack_landmarks("open"))

    feature, feedback = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="jumping_jack", count=0, state="down"),
        exercise_type="jumping_jack",
    )

    assert feature.type == "jumping_jack"
    assert feature.state == "up"
    assert feature.count == 1
    assert _has_no_mojibake(feedback)


def test_target_lock_keeps_first_user_when_second_person_enters(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _squat_landmarks("down"))

    locked_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="up"),
        exercise_type="squat",
    )
    assert locked_feature.target_signature is not None
    assert locked_feature.target_status == "target_locked"

    distractor = _shift_landmarks(_squat_landmarks("down"), 0.28)
    target_up = _squat_landmarks("up")
    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: [distractor, target_up])

    feature, _ = analyzer.analyze(_blank_frame(), locked_feature, exercise_type="squat")

    assert feature.target_status == "multi_person_detected"
    assert feature.person_count == 2
    assert feature.target_confidence and feature.target_confidence > 0.7
    assert feature.count == 1


def test_target_lost_does_not_switch_to_other_person(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _squat_landmarks("down"))
    locked_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=2, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    other_person = _shift_landmarks(_squat_landmarks("up"), 0.34)
    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: [other_person])
    feature, _ = analyzer.analyze(_blank_frame(), locked_feature, exercise_type="squat")

    assert feature.target_status == "target_recovering"
    assert feature.count == locked_feature.count
    assert feature.rep_phase == locked_feature.rep_phase
    assert feature.target_signature == locked_feature.target_signature
    assert "target_recovering" in feature.posture_errors

    current = feature
    for _ in range(analyzer._TARGET_LOST_GRACE_FRAMES):
        current, _ = analyzer.analyze(_blank_frame(), current, exercise_type="squat")

    assert current.target_status == "target_lost"
    assert current.count == locked_feature.count
    assert "target_lost" in current.posture_errors


def test_target_reconnects_when_original_user_returns(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _squat_landmarks("down"))
    locked_feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="down", rep_phase="down"),
        exercise_type="squat",
    )

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: [_shift_landmarks(_squat_landmarks("up"), 0.34)])
    lost_feature, _ = analyzer.analyze(_blank_frame(), locked_feature, exercise_type="squat")
    assert lost_feature.target_status == "target_recovering"

    monkeypatch.setattr(analyzer, "_detect_landmarks", lambda frame: [_squat_landmarks("up")])
    reconnected_feature, _ = analyzer.analyze(_blank_frame(), lost_feature, exercise_type="squat")

    assert reconnected_feature.target_status == "tracking"
    assert reconnected_feature.target_confidence and reconnected_feature.target_confidence > 0.7


@pytest.mark.parametrize(
    ("expected", "landmarks"),
    [
        ("squat", _squat_landmarks("down")),
        ("pushup", _pushup_landmarks("down")),
        ("lunge", _lunge_landmarks("down_left")),
        ("knee_raise", _knee_raise_landmarks("left_up")),
        ("jumping_jack", _jumping_jack_landmarks("open")),
    ],
)
def test_exercise_classifier_detects_five_supported_exercises(expected, landmarks):
    classifier = ExerciseClassifier(Path("models/exercise_classifier/exercise_classifier.json"))

    detected_type, confidence = classifier.classify_frame(landmarks)

    assert detected_type == expected
    assert confidence > 0


def test_goal_mismatch_is_reported_when_detected_exercise_differs(monkeypatch):
    analyzer = _analyzer_with_landmarks(monkeypatch, _jumping_jack_landmarks("open"))

    feature, _ = analyzer.analyze(
        _blank_frame(),
        ExerciseFeature(type="squat", count=0, state="idle"),
        exercise_type="squat",
    )

    assert feature.detected_type == "jumping_jack"
    assert feature.exercise_confidence and feature.exercise_confidence >= 0.55
    assert feature.goal_mismatch is True


def test_pose_analyzer_feedback_for_posture_errors_has_no_mojibake():
    analyzer = PoseAnalyzer(use_mediapipe_tasks=False)

    feedback_items = [
        analyzer._feedback("squat", "idle", ["knees_caving_in"], 0.8),
        analyzer._feedback("pushup", "idle", ["hip_sagging"], 0.8),
        analyzer._feedback("jumping_jack", "idle", ["unsynced_jumping_jack"], 0.8),
    ]

    assert feedback_items[0] == "무릎이 안쪽으로 모이지 않게 발끝 방향과 맞춰 주세요."
    assert all(_has_no_mojibake(item) for item in feedback_items)


def _has_no_mojibake(text: str) -> bool:
    return not any(marker in text for marker in ["�", "占", "?꾩", "醫", "臾"])
