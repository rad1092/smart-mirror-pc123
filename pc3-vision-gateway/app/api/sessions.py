from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.dependencies import (
    get_app_store,
    get_coach_client,
    get_feature_builder,
    get_store,
)
from app.exercise_types import normalize_exercise_type
from app.schemas.feature import ExerciseFeature
from app.features.feature_builder import FeatureBuilder
from app.llm_client.coach_client import CoachClient, PC2_BASELINE_DIFF_FIELDS, PC2_EXERCISE_FIELDS
from app.schemas.session import (
    Session,
    SessionResultResponse,
    SessionSkipRequest,
    SessionSkipResponse,
    SessionStartRequest,
    SessionStartResponse,
    SessionStatus,
    SessionStopResponse,
)
from app.storage.memory_store import MemoryStore
from app.storage.app_store import AppStore


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/start", response_model=SessionStartResponse)
def start_session(
    request: SessionStartRequest,
    settings: Settings = Depends(get_settings),
    store: MemoryStore = Depends(get_store),
) -> SessionStartResponse:
    session_id = f"sess_{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    session = Session(
        session_id=session_id,
        user_id=request.user_id,
        mode=request.mode,
        goal=request.goal,
        routine_id=request.routine_id,
        routine_day_id=request.routine_day_id,
        status=SessionStatus.running,
        created_at=now,
        updated_at=now,
    )
    store.create_session(session)
    return SessionStartResponse(
        **session.model_dump(),
        ws_url=settings.ws_url_for_session(session_id),
    )


@router.post("/{session_id}/stop", response_model=SessionStopResponse)
async def stop_session(
    session_id: str,
    settings: Settings = Depends(get_settings),
    store: MemoryStore = Depends(get_store),
    feature_builder: FeatureBuilder = Depends(get_feature_builder),
    coach_client: CoachClient = Depends(get_coach_client),
    app_store: AppStore = Depends(get_app_store),
) -> SessionStopResponse:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    stopped_session = store.set_status(session_id, SessionStatus.stopped)
    if stopped_session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    features = store.get_features(session_id)
    if stopped_session.mode.value == "exercise":
        exercise_type = normalize_exercise_type(stopped_session.goal)
        if features.exercise is None:
            features.exercise = ExerciseFeature(type=exercise_type)
        else:
            features.exercise = features.exercise.model_copy(update={"type": exercise_type})
        measurement_quality = _measurement_quality(
            store.get_measurement_stats(session_id),
            settings.min_valid_frame_ratio,
            settings.max_model_disagreement_ratio,
        )
        features.exercise = features.exercise.model_copy(
            update={
                "measurement_quality": measurement_quality["measurement_quality"],
                "measurement_confidence": measurement_quality["measurement_confidence"],
            }
        )
    else:
        measurement_quality = _measurement_quality(
            {},
            settings.min_valid_frame_ratio,
            settings.max_model_disagreement_ratio,
        )
    payload = feature_builder.build_payload(
        stopped_session,
        event="session_completed",
        features=features,
    )
    try:
        coaching = await coach_client.generate(payload)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "reason": "pc2_coach_failed",
                "status_code": exc.response.status_code,
            },
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail={"reason": "pc2_coach_unavailable"},
        ) from exc
    except (TypeError, ValueError, ValidationError) as exc:
        raise HTTPException(
            status_code=502,
            detail={"reason": "invalid_pc2_coach_response"},
        ) from exc

    result = SessionStopResponse(
        session_id=session_id,
        status=stopped_session.status,
        features=payload.features,
        baseline_diff=payload.baseline_diff,
        environment=payload.environment,
        coaching=coaching,
    )
    request_json = _build_pc2_request_json(coach_client, payload)
    coaching_json = coaching.model_dump(mode="json")
    app_store.save_completed_workout(payload, request_json, coaching_json)
    app_store.save_coach_log(
        session_id=session_id,
        user_id=payload.user_id,
        request_json=request_json,
        final_response_json=coaching_json,
    )
    store.set_result(result)
    return result


def _build_pc2_request_json(coach_client: CoachClient, payload) -> dict:
    builder = getattr(coach_client, "build_pc2_request_json", None)
    if callable(builder):
        return builder(payload)

    exercise = payload.features.exercise
    if payload.mode != "exercise" or payload.event != "session_completed" or exercise is None:
        raise ValueError("PC2 coach requests are only supported for completed exercise sessions.")

    raw_exercise = exercise.model_dump(mode="json", exclude_none=True)
    exercise_json = {
        key: value
        for key, value in raw_exercise.items()
        if key in PC2_EXERCISE_FIELDS
    }
    request = {
        "user_id": payload.user_id,
        "session_id": payload.session_id,
        "mode": "exercise",
        "event": "session_completed",
        "features": {"exercise": exercise_json},
        "baseline_diff": {},
    }
    if payload.routine_id is not None:
        request["routine_id"] = payload.routine_id
    if payload.routine_day_id is not None:
        request["routine_day_id"] = payload.routine_day_id

    exercise_diff = payload.baseline_diff.get("exercise") if payload.baseline_diff else None
    if isinstance(exercise_diff, dict):
        request["baseline_diff"] = {
            "exercise": {
                key: value
                for key, value in exercise_diff.items()
                if key in PC2_BASELINE_DIFF_FIELDS and value is not None
            }
        }
    if payload.environment is not None:
        environment = payload.environment.model_dump(mode="json", exclude_none=True)
        if environment:
            request["environment"] = environment
    if payload.purpose:
        request["purpose"] = payload.purpose
    return request


@router.post("/{session_id}/skip", response_model=SessionSkipResponse)
async def skip_session(
    session_id: str,
    request: SessionSkipRequest | None = None,
    store: MemoryStore = Depends(get_store),
    app_store: AppStore = Depends(get_app_store),
) -> SessionSkipResponse:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    skipped_session = store.set_status(session_id, SessionStatus.skipped)
    if skipped_session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    features = store.get_features(session_id)
    exercise_type = normalize_exercise_type(skipped_session.goal)
    if features.exercise is None:
        features.exercise = ExerciseFeature(type=exercise_type)
    else:
        features.exercise = features.exercise.model_copy(update={"type": exercise_type})

    reason = request.reason if request else None
    app_store.save_skipped_workout(
        session_id=session_id,
        user_id=skipped_session.user_id,
        routine_id=skipped_session.routine_id,
        routine_day_id=skipped_session.routine_day_id,
        exercise=features.exercise,
        reason=reason,
    )

    result = SessionSkipResponse(
        session_id=session_id,
        status=skipped_session.status,
        features=features,
        baseline_diff={},
        environment=None,
        coaching=None,
        skip_reason=reason,
    )
    store.set_result(result)
    return result

def _measurement_quality(
    stats: dict,
    min_valid_frame_ratio: float,
    max_model_disagreement_ratio: float,
) -> dict:
    analyzed = int(stats.get("analyzed_frames", 0) or 0)
    valid = int(stats.get("valid_frames", 0) or 0)
    disagreement = int(stats.get("model_disagreement_frames", 0) or 0)
    target_lost = int(stats.get("target_lost_frames", 0) or 0)
    if analyzed <= 0:
        return {
            "measurement_quality": "insufficient_frames",
            "measurement_confidence": 0.0,
            "valid_frame_ratio": 0.0,
            "model_disagreement_ratio": 0.0,
            "pc2_allowed": False,
        }

    valid_ratio = valid / analyzed
    disagreement_ratio = disagreement / analyzed
    target_lost_ratio = target_lost / analyzed
    confidence = max(0.0, min(valid_ratio, 1.0 - disagreement_ratio, 1.0 - target_lost_ratio))
    pc2_allowed = (
        valid_ratio >= min_valid_frame_ratio
        and disagreement_ratio <= max_model_disagreement_ratio
    )
    quality = "pc2_ready" if pc2_allowed else "low_quality"
    return {
        "measurement_quality": quality,
        "measurement_confidence": round(confidence, 3),
        "valid_frame_ratio": round(valid_ratio, 3),
        "model_disagreement_ratio": round(disagreement_ratio, 3),
        "pc2_allowed": pc2_allowed,
    }


@router.get("/{session_id}/result", response_model=SessionResultResponse)
def get_session_result(
    session_id: str,
    store: MemoryStore = Depends(get_store),
    feature_builder: FeatureBuilder = Depends(get_feature_builder),
) -> SessionResultResponse:
    result = store.get_result(session_id)
    if result is not None:
        return result

    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    features = store.get_features(session_id)
    payload = feature_builder.build_payload(
        session,
        event="current_state",
        features=features,
    )
    return SessionResultResponse(
        session_id=session_id,
        status=session.status,
        features=payload.features,
        baseline_diff=payload.baseline_diff,
        environment=payload.environment,
        coaching=None,
    )
