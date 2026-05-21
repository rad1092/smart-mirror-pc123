from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class EnvironmentBaseline(BaseModel):
    baseline_illuminance: float | None = None


class BaselineUpsertRequest(BaseModel):
    exercise: dict[str, Any] | None = None
    body: dict[str, Any] | None = None
    face: dict[str, Any] | None = None
    environment: EnvironmentBaseline | None = None

    def to_updates(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)


class BaselineResponse(BaseModel):
    user_id: str
    source: Literal["user", "default"]
    baseline: dict[str, Any]


class BaselineUpsertResponse(BaselineResponse):
    status: Literal["saved"] = "saved"


class BaselineCaptureResponse(BaseModel):
    valid: bool
    slot_type: str
    reason: str | None = None
