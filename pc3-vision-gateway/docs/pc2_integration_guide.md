# PC2 Integration Guide

PC3 calls PC2 only for generation work. PC3 owns the PC1-facing app data ledger
and does not send raw camera data or PC1 display-only fields to PC2.

## Active Endpoints

Current PC3 routes actively call these PC2 endpoints:

```text
POST /api/routine/profile
POST /api/coach/generate
```

PC3 settings:

```env
PC2_ROUTINE_API_URL=http://<PC2_HOST>:7000/api/routine/profile
PC2_COACH_API_URL=http://<PC2_HOST>:7000/api/coach/generate
PC2_TIMEOUT_SECONDS=90
```

PC3 does not currently call PC2 for day lookup, calendar lookup, body metrics,
progress, or coach-log reads. Those PC1-facing reads come from the PC3 SQLite app
DB after PC3 stores routine plans, routine days, workout results, and coaching
logs.

If PC2 is unavailable, PC3 returns `503`. If PC2 returns an invalid response,
PC3 returns `502`. PC3 does not create local routine or coaching fallback
responses.

## Pre-Exercise Routine Request

PC1 sends `RecommendationRequestPayload` to PC3. PC3 verifies the saved baseline,
adds recent PC3 user history when available, and sends PC2 a compact profile
request:

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
  "start_date": "2026-05-22",
  "user_history": {
    "body_metrics": [],
    "workout_results": [],
    "coach_logs": [],
    "latest_routine": null,
    "calendar_days": []
  }
}
```

Mapping rules:

- `goal` becomes `user_goal`.
- `experience_level` becomes `exercise_experience`.
- `weekly_frequency` maps as `once_twice=2`, `three_four=4`, `five_plus=5`.
- `limitations` maps to PC2 display labels: `무릎`, `허리`, `어깨`, `발목`.
- `start_date` is passed when PC1/PC3 provides it. If omitted, PC3/PC2 can use
  the current server date as Day 1.
- Raw images, baseline slot data, PC1 UI-only fields, and null fields are not
  sent.

PC3 also accepts the newer flat PC1 request shape and normalizes it before
calling PC2.

## Pre-Exercise Routine Response

PC2 should return a routine JSON object with a usable `weekly_routine`. PC3
flattens the first valid exercises into PC1 preview `items`, stores the complete
routine plan, and saves each scheduled day to PC3 app DB.

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
    "start_date": "2026-05-22",
    "scheduled_dates": ["2026-05-22", "2026-05-23"]
  }
}
```

PC3 preserves `routine_id`, `start_date`, `scheduled_dates`, `weekly_routine`,
`how_to`, and `tips` for PC1. After this response is stored, PC1 day/calendar
reads are served by PC3 app DB.

## Post-Exercise Coaching Request

PC3 calls coaching only for completed exercise sessions:

| mode | event | PC2 call |
| --- | --- | --- |
| `exercise` | `session_completed` | yes |
| `exercise` | frame update | no |
| `exercise` | skipped session | no |

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

PC3 preserves this response under the session stop `coaching` field, saves a
completed workout result, and stores a coach log in PC3 app DB.
