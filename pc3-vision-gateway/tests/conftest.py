from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.dependencies import store
from app.main import app


@pytest.fixture(autouse=True)
def reset_memory_store():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def image_bytes() -> bytes:
    image = np.zeros((240, 240, 3), dtype=np.uint8)
    image[:] = (130, 120, 110)
    image[84:132, 72:168] = (80, 48, 35)
    image[132:204, 72:168] = (20, 20, 20)
    success, buffer = cv2.imencode(".jpg", image)
    assert success
    return buffer.tobytes()


@pytest.fixture
def baseline_path() -> Path:
    return Path("data/baseline_default.json")
