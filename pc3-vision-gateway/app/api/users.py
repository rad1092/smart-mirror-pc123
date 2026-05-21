from __future__ import annotations

from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.baseline.baseline_service import BaselineService
from app.dependencies import get_app_store, get_baseline_service
from app.storage.app_store import AppStore


router = APIRouter(tags=["users"])


@router.get("/api/users/profiles")
def list_profiles(app_store: AppStore = Depends(get_app_store)) -> dict:
    return {"profiles": app_store.list_profiles()}


@router.post("/api/users/profiles")
def create_profile(
    payload: dict = Body(...),
    app_store: AppStore = Depends(get_app_store),
) -> dict:
    profile = _normalize_profile_payload(payload)
    if not profile.get("id"):
        profile["id"] = f"profile_{uuid4().hex[:12]}"
    try:
        return app_store.upsert_profile(profile)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/api/users/profiles/{user_id}")
def update_profile(
    user_id: str,
    payload: dict = Body(...),
    app_store: AppStore = Depends(get_app_store),
) -> dict:
    profile = _normalize_profile_payload(payload)
    profile["id"] = user_id
    try:
        return app_store.upsert_profile(profile)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/api/users/profiles/{user_id}")
def delete_profile(
    user_id: str,
    app_store: AppStore = Depends(get_app_store),
    baseline_service: BaselineService = Depends(get_baseline_service),
) -> dict:
    app_store.delete_user(user_id)
    baseline_service.delete_baseline(user_id)
    return {"user_id": user_id, "deleted": True}


@router.post("/api/users/{user_id}/body-metrics")
def create_body_metric(
    user_id: str,
    payload: dict = Body(...),
    app_store: AppStore = Depends(get_app_store),
) -> dict:
    measured_date = payload.get("measured_date") or date.today().isoformat()
    try:
        weight_kg = float(payload["weight_kg"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="weight_kg is required") from exc
    return app_store.save_body_metric(
        user_id=user_id,
        measured_date=str(measured_date),
        weight_kg=weight_kg,
        memo=payload.get("memo"),
    )


@router.get("/api/users/{user_id}/progress")
def get_user_progress(
    user_id: str,
    days: int = Query(default=30, ge=1, le=365),
    app_store: AppStore = Depends(get_app_store),
) -> dict:
    return app_store.get_user_progress(user_id, days)


@router.get("/api/coach/logs/{user_id}")
def get_coach_logs(
    user_id: str,
    limit: int = Query(default=10, ge=1, le=100),
    app_store: AppStore = Depends(get_app_store),
) -> dict:
    return app_store.get_coach_logs(user_id, limit)


def _normalize_profile_payload(payload: dict) -> dict:
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else payload
    return {
        "id": str(profile.get("id") or profile.get("user_id") or "").strip(),
        "name": str(profile.get("name") or "User").strip(),
        "weight_kg": float(profile.get("weight_kg") or 0),
        "height_cm": float(profile.get("height_cm") or 0),
        "goal": profile.get("goal") or "build_habit",
        "experience_level": profile.get("experience_level") or "beginner",
        "weekly_frequency": profile.get("weekly_frequency") or "three_four",
        "limitations": list(profile.get("limitations") or []),
    }
