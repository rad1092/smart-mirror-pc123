# PC2 Integration Guide

PC3 calls PC2 only through sanitized, contract-shaped payloads. PC2 does not
receive raw camera data or PC1 display-only fields.

## Endpoints

PC3 uses these PC2 endpoints:

```text
POST /api/routine/profile
GET  /api/routine/profile/{user_id}/day?target_date=YYYY-MM-DD
GET  /api/routine/profile/{user_id}/calendar?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
POST /api/users/{user_id}/body-metrics
GET  /api/users/{user_id}/progress?days=30
POST /api/coach/generate
GET  /api/coach/logs/{user_id}?limit=10
```

PC3 settings:

```env
PC2_ROUTINE_API_URL=http://<PC2_HOST>:7000/api/routine/profile
PC2_ROUTINE_DAY_API_URL=http://<PC2_HOST>:7000/api/routine/profile/{user_id}/day
PC2_ROUTINE_CALENDAR_API_URL=http://<PC2_HOST>:7000/api/routine/profile/{user_id}/calendar
PC2_BODY_METRICS_API_URL=http://<PC2_HOST>:7000/api/users/{user_id}/body-metrics
PC2_PROGRESS_API_URL=http://<PC2_HOST>:7000/api/users/{user_id}/progress
PC2_COACH_API_URL=http://<PC2_HOST>:7000/api/coach/generate
PC2_COACH_LOGS_API_URL=http://<PC2_HOST>:7000/api/coach/logs/{user_id}
```

If PC2 is unavailable, PC3 returns `503`. If PC2 returns an invalid response,
PC3 returns `502`. PC3 does not create local routine or coaching fallback
responses.

## Pre-Exercise Routine Request

PC1 sends `RecommendationRequestPayload` to PC3. PC3 verifies the saved baseline
and sends PC2 a compact profile request:

```json
{
  "user_id": "profile_1",
  "user_goal": "하체 강화",
  "exercise_experience": "초보",
  "available_days_per_week": 4,
  "restricted_body_parts": ["무릎"],
  "purpose": "pre_exercise_routine",
  "profile_name": "Mirror User",
  "weight_kg": 70,
  "start_date": "2026-05-13"
}
```

Mapping rules:

- `goal` becomes a human-readable `user_goal`.
- `experience_level` becomes a human-readable `exercise_experience`.
- `weekly_frequency` maps as `once_twice=2`, `three_four=4`, `five_plus=5`.
- `limitations` maps to PC2 display labels: `무릎`, `허리`, `어깨`, `발목`.
- `start_date` is passed when PC1/PC3 provides it. If omitted, PC2 uses its
  server date as Day 1.
- Raw images, baseline slot data, PC1 UI-only fields, and null fields are not
  sent.

## Pre-Exercise Routine Response

PC2 should return a `RoutineProfileResponse` with a weekly routine. PC3 flattens
the first valid exercises into PC1 `RecommendationResponsePayload.items`.

Example PC2 response:

```json
{
  "summary": "Weekly lower-body routine generated.",
  "weekly_focus": "Build stable knee and hip control.",
  "weekly_routine": [
    {
      "day_label": "Day 1",
      "focus": "lower body control",
      "exercises": [
        {
          "exercise": "squat",
          "sets": 2,
          "reps": 8,
          "duration_sec": null,
          "rest_sec": 60,
          "focus": "slow tempo",
          "reason": "Practice stable knee tracking.",
          "how_to": "Stand tall, sit the hips back, then press through the feet.",
          "tips": "Keep knees tracking over toes."
        }
      ]
    }
  ],
  "cautions": ["Stop if knee pain appears."],
  "pc3_payload": {
    "routine_id": "routine_abcd1234",
    "start_date": "2026-05-13",
    "scheduled_dates": ["2026-05-13", "2026-05-14"],
    "weekly_routine": []
  }
}
```

PC3 preserves `pc3_payload.routine_id`, `pc3_payload.start_date`,
`pc3_payload.scheduled_dates`, and the detailed `how_to`/`tips` fields for PC1.

## Date-Based Routine Lookup

PC3 calls this PC2 endpoint when PC1 asks for a specific scheduled day:

```http
GET /api/routine/profile/{user_id}/day?target_date=YYYY-MM-DD
```

PC2 response:

```json
{
  "routine_id": "routine_abcd1234",
  "user_id": "profile_1",
  "scheduled_date": "2026-05-14",
  "day_index": 2,
  "day_label": "Day 2",
  "focus": "upper body support",
  "exercises": [
    {
      "exercise": "pushup",
      "sets": 3,
      "reps": 8,
      "duration_sec": null,
      "rest_sec": 60,
      "focus": "body line",
      "reason": "Build upper support.",
      "how_to": "Lower and press while keeping one straight body line.",
      "tips": "Brace the core."
    }
  ],
  "summary": "Weekly routine",
  "weekly_focus": "Consistency",
  "message": "Today is pushup day."
}
```

## Post-Exercise Coaching Request

PC3 calls coaching only for completed exercise sessions:

| mode | event | PC2 call |
| --- | --- | --- |
| `exercise` | `session_completed` | yes |
| `exercise` | frame update | no |

Request:

```json
{
  "user_id": "profile_1",
  "session_id": "sess_abc",
  "routine_id": "routine_abcd1234",
  "routine_day_id": 12,
  "mode": "exercise",
  "event": "session_completed",
  "features": {
    "exercise": {
      "type": "pushup",
      "count": 5,
      "state": "up",
      "stability_score": 0.72,
      "posture_errors": [],
      "duration_sec": 180,
      "measurement_quality": "pc2_ready",
      "measurement_confidence": 0.86
    }
  },
  "baseline_diff": {
    "exercise": {
      "count_change": -2,
      "stability_change": -0.1
    }
  },
  "environment": {
    "temperature": 24.5,
    "humidity": 48,
    "illuminance": 360
  }
}
```

Supported exercise types:

- `squat`
- `jumping_jack`
- `knee_raise`
- `lunge`
- `pushup`

PC3 strips fields that PC2 does not allow, including target tracking,
classifier, side counters, image, video, full landmarks, segmentation, UI-only
state, and null fields.

## Post-Exercise Coaching Response

PC2 should return `CoachingResponse` JSON:

```json
{
  "summary": "Plan generated from the final exercise session.",
  "priority": "posture stability",
  "exercise_plan": [
    {
      "exercise": "pushup",
      "sets": 3,
      "reps": 6,
      "duration_sec": null,
      "rest_sec": 60,
      "focus": "slow tempo",
      "reason": "Keep posture stable before increasing reps."
    }
  ],
  "mirror_message": "Slow down and keep posture stable.",
  "warnings": [],
  "pc2_payload": {
    "message": "Slow pushups first.",
    "display_lines": ["slow tempo", "stable posture"]
  }
}
```

PC3 preserves this response under the session stop `coaching` field for PC1.
