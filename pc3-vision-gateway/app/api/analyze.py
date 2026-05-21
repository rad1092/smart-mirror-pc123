from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.dependencies import get_pose_analyzer, get_store
from app.exercise_types import normalize_exercise_type
from app.schemas.feature import ExerciseAnalyzeResponse
from app.schemas.session import Session
from app.storage.memory_store import MemoryStore
from app.vision.frame_utils import decode_image_bytes
from app.vision.pose_analyzer import PoseAnalyzer
from app.websocket.manager import manager


router = APIRouter(prefix="/api/analyze", tags=["analyze"])
_session_analyze_locks: dict[str, asyncio.Lock] = {}


def _analyze_lock(session_id: str) -> asyncio.Lock:
    lock = _session_analyze_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_analyze_locks[session_id] = lock
    return lock


def _session_for_mode(
    session_id: str,
    expected_mode: str,
    store: MemoryStore,
) -> Session:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.mode.value != expected_mode:
        raise HTTPException(
            status_code=400,
            detail=f"Session mode is '{session.mode.value}', but endpoint requires '{expected_mode}'.",
        )
    return session


async def _decode_upload(file: UploadFile):
    image_bytes = await file.read()
    try:
        return decode_image_bytes(image_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/exercise", response_model=ExerciseAnalyzeResponse)
async def analyze_exercise(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    store: MemoryStore = Depends(get_store),
    pose_analyzer: PoseAnalyzer = Depends(get_pose_analyzer),
) -> ExerciseAnalyzeResponse:
    session = _session_for_mode(session_id, "exercise", store)
    frame = await _decode_upload(file)
    async with _analyze_lock(session_id):
        previous = store.get_features(session_id).exercise
        exercise, feedback = pose_analyzer.analyze(frame, previous, exercise_type=session.goal)
        exercise = exercise.model_copy(update={"type": normalize_exercise_type(session.goal)})
        store.set_exercise_feature(session_id, exercise)
        store.record_exercise_measurement(session_id, exercise)
        message = {
            "type": "exercise_update",
            "session_id": session_id,
            "count": exercise.count,
            "state": exercise.state,
            "feedback": feedback,
            "posture_errors": exercise.posture_errors,
            "stability_score": exercise.stability_score,
        }
        if exercise.count_left is not None:
            message["count_left"] = exercise.count_left
        if exercise.count_right is not None:
            message["count_right"] = exercise.count_right
        for key in (
            "person_count",
            "target_status",
            "target_confidence",
            "detected_type",
            "exercise_confidence",
            "goal_mismatch",
            "measurement_quality",
            "measurement_confidence",
        ):
            value = getattr(exercise, key)
            if value is not None:
                message[key] = value
        await manager.broadcast(session_id, message)
        return ExerciseAnalyzeResponse(
            session_id=session_id,
            exercise=exercise,
            feedback=feedback,
        )
