from __future__ import annotations

import logging

try:
    import cv2
    import numpy as np
except Exception:  # pragma: no cover - exercised only when native deps are missing.
    cv2 = None
    np = None


logger = logging.getLogger(__name__)


def decode_image_bytes(image_bytes: bytes):
    if cv2 is None or np is None:
        raise ValueError("OpenCV and numpy are required to decode images.")
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Uploaded file is not a decodable image.")
    return frame


def normalized_region(frame, x1: float, y1: float, x2: float, y2: float):
    height, width = frame.shape[:2]
    left = max(0, min(width - 1, int(width * x1)))
    right = max(left + 1, min(width, int(width * x2)))
    top = max(0, min(height - 1, int(height * y1)))
    bottom = max(top + 1, min(height, int(height * y2)))
    return frame[top:bottom, left:right]


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))
