from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

from app.exercise_types import DEFAULT_EXERCISE_TYPE, SUPPORTED_EXERCISE_TYPES


LANDMARK_INDEX = {
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


class ExerciseClassifier:
    def __init__(self, model_path: str | Path | None = None, window_size: int = 5) -> None:
        self._window_size = max(1, window_size)
        self._config = self._load_config(model_path)

    def classify(
        self,
        landmarks,
        previous_window: list[str] | None = None,
    ) -> tuple[str, float, list[str]]:
        frame_type, frame_confidence = self.classify_frame(landmarks)
        window = [item for item in (previous_window or []) if item in SUPPORTED_EXERCISE_TYPES]
        window.append(frame_type)
        window = window[-self._window_size :]

        counts = Counter(window)
        detected_type, votes = counts.most_common(1)[0]
        vote_confidence = votes / len(window)
        confidence = round(min(1.0, max(0.0, (frame_confidence * 0.7) + (vote_confidence * 0.3))), 3)
        return detected_type, confidence, window

    def classify_frame(self, landmarks) -> tuple[str, float]:
        features = self._features(landmarks)
        knee_raise_score = self._score_knee_raise(features)
        if features["max_knee_raise"] >= self._threshold("knee_raise_min_height", 0.08) and knee_raise_score >= 0.45:
            return "knee_raise", round(min(1.0, knee_raise_score), 3)
        scores = {
            "pushup": self._score_pushup(features),
            "jumping_jack": self._score_jumping_jack(features),
            "knee_raise": knee_raise_score,
            "lunge": self._score_lunge(features),
            "squat": self._score_squat(features),
        }
        detected_type, score = max(scores.items(), key=lambda item: item[1])
        if score <= 0:
            return DEFAULT_EXERCISE_TYPE, 0.0
        return detected_type, round(min(1.0, score), 3)

    def _load_config(self, model_path: str | Path | None) -> dict[str, Any]:
        if model_path is None:
            return {}
        path = Path(model_path)
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _threshold(self, key: str, default: float) -> float:
        return float(self._config.get("thresholds", {}).get(key, default))

    def _features(self, landmarks) -> dict[str, float]:
        shoulder_width = max(self._distance("LEFT_SHOULDER", "RIGHT_SHOULDER", landmarks), 0.001)
        hip_width = self._distance("LEFT_HIP", "RIGHT_HIP", landmarks)
        ankle_width = self._distance("LEFT_ANKLE", "RIGHT_ANKLE", landmarks)
        body_width = max(self._bbox(landmarks)["width"], 0.001)
        body_height = max(self._bbox(landmarks)["height"], 0.001)
        left_knee = self._angle("LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE", landmarks)
        right_knee = self._angle("RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE", landmarks)
        left_elbow = self._angle("LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST", landmarks)
        right_elbow = self._angle("RIGHT_SHOULDER", "RIGHT_ELBOW", "RIGHT_WRIST", landmarks)
        left_knee_raise = self._landmark(landmarks, "LEFT_HIP").y - self._landmark(landmarks, "LEFT_KNEE").y
        right_knee_raise = self._landmark(landmarks, "RIGHT_HIP").y - self._landmark(landmarks, "RIGHT_KNEE").y
        wrists_over_shoulders = self._arms_up(landmarks)
        wrists_below_shoulders = self._arms_down(landmarks)
        return {
            "avg_knee_angle": (left_knee + right_knee) / 2,
            "min_knee_angle": min(left_knee, right_knee),
            "max_knee_angle": max(left_knee, right_knee),
            "avg_elbow_angle": (left_elbow + right_elbow) / 2,
            "feet_ratio": ankle_width / shoulder_width,
            "hip_ratio": hip_width / shoulder_width,
            "body_aspect": body_width / body_height,
            "max_knee_raise": max(left_knee_raise, right_knee_raise),
            "knee_raise_gap": abs(left_knee_raise - right_knee_raise),
            "wrists_over_shoulders": 1.0 if wrists_over_shoulders else 0.0,
            "wrists_below_shoulders": 1.0 if wrists_below_shoulders else 0.0,
        }

    def _score_pushup(self, features: dict[str, float]) -> float:
        aspect = features["body_aspect"]
        elbow = features["avg_elbow_angle"]
        min_aspect = self._threshold("pushup_min_body_aspect", 1.25)
        elbow_bonus = 0.25 if elbow <= self._threshold("pushup_bent_elbow_angle", 135) else 0.05
        return max(0.0, min(1.0, ((aspect - min_aspect) / 0.75) + elbow_bonus))

    def _score_jumping_jack(self, features: dict[str, float]) -> float:
        feet_ratio = features["feet_ratio"]
        open_ratio = self._threshold("jumping_jack_open_feet_ratio", 1.45)
        arm_bonus = 0.35 if features["wrists_over_shoulders"] else 0.0
        return max(0.0, min(1.0, ((feet_ratio - open_ratio) / 0.7) + arm_bonus))

    def _score_knee_raise(self, features: dict[str, float]) -> float:
        height = features["max_knee_raise"]
        gap = features["knee_raise_gap"]
        min_height = self._threshold("knee_raise_min_height", 0.08)
        return max(0.0, min(1.0, ((height - min_height) / 0.18) + min(gap, 0.18)))

    def _score_lunge(self, features: dict[str, float]) -> float:
        min_knee = features["min_knee_angle"]
        max_knee = features["max_knee_angle"]
        if min_knee > self._threshold("lunge_max_front_knee_angle", 120):
            return 0.0
        split_bonus = max(0.0, min(0.45, (max_knee - min_knee) / 160))
        return max(0.0, min(1.0, ((125 - min_knee) / 65) + split_bonus))

    def _score_squat(self, features: dict[str, float]) -> float:
        avg_knee = features["avg_knee_angle"]
        hip_ratio = features["hip_ratio"]
        if features["body_aspect"] > self._threshold("standing_max_body_aspect", 1.15):
            return 0.0
        knee_score = max(0.0, min(1.0, (145 - avg_knee) / 65))
        stance_bonus = 0.15 if hip_ratio >= 0.65 else 0.0
        return max(0.0, min(1.0, knee_score + stance_bonus))

    def _landmark(self, landmarks, name: str):
        return landmarks[LANDMARK_INDEX[name]]

    def _distance(self, a: str, b: str, landmarks) -> float:
        first = self._landmark(landmarks, a)
        second = self._landmark(landmarks, b)
        return math.hypot(first.x - second.x, first.y - second.y)

    def _angle(self, a: str, b: str, c: str, landmarks) -> float:
        first = self._landmark(landmarks, a)
        middle = self._landmark(landmarks, b)
        third = self._landmark(landmarks, c)
        ba = (first.x - middle.x, first.y - middle.y)
        bc = (third.x - middle.x, third.y - middle.y)
        norm_ba = math.hypot(*ba)
        norm_bc = math.hypot(*bc)
        if norm_ba == 0 or norm_bc == 0:
            return 180.0
        cosine = max(-1.0, min(1.0, ((ba[0] * bc[0]) + (ba[1] * bc[1])) / (norm_ba * norm_bc)))
        return math.degrees(math.acos(cosine))

    def _bbox(self, landmarks) -> dict[str, float]:
        xs = [self._landmark(landmarks, name).x for name in LANDMARK_INDEX]
        ys = [self._landmark(landmarks, name).y for name in LANDMARK_INDEX]
        return {
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys),
        }

    def _arms_up(self, landmarks) -> bool:
        left_wrist = self._landmark(landmarks, "LEFT_WRIST")
        right_wrist = self._landmark(landmarks, "RIGHT_WRIST")
        left_shoulder = self._landmark(landmarks, "LEFT_SHOULDER")
        right_shoulder = self._landmark(landmarks, "RIGHT_SHOULDER")
        return left_wrist.y < left_shoulder.y and right_wrist.y < right_shoulder.y

    def _arms_down(self, landmarks) -> bool:
        left_wrist = self._landmark(landmarks, "LEFT_WRIST")
        right_wrist = self._landmark(landmarks, "RIGHT_WRIST")
        left_hip = self._landmark(landmarks, "LEFT_HIP")
        right_hip = self._landmark(landmarks, "RIGHT_HIP")
        return left_wrist.y > left_hip.y and right_wrist.y > right_hip.y
