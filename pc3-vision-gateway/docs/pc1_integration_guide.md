# PC1 Integration Guide

PC1 is the exercise-only frontend. PC3 provides baseline validation, pre-exercise
routine planning, pose analysis, realtime feedback, local app-data storage, and
post-exercise coaching bridging.

UI/UX 구현자는 먼저 repo root의 `PC1_UI_CONTRACT.md`를 읽어야 합니다. 이 문서는 개발 연동 세부 정보이고, 화면 흐름과 표시 기준의 우선 계약은 `PC1_UI_CONTRACT.md`입니다.

## Base URL

Local development:

```text
http://127.0.0.1:9000
```

When PC1 runs on another computer, start PC3 on all interfaces and expose the
WebSocket host:

```env
HOST=0.0.0.0
WS_PUBLIC_HOST=<PC3_LAN_IP>
```

PC1 should call PC3, not PC2, for the routine recommendation flow.

## 1. Baseline Capture

```http
POST /api/baselines/users/{user_id}/capture
Content-Type: multipart/form-data
```

Form fields:

- `slot_type`: `face_front`, `body_front_full`
- `file`: captured image file

Response:

```json
{
  "valid": true,
  "slot_type": "face_front",
  "reason": null
}
```

PC3 does not store the original image. It stores validated baseline measurements
and slot checkpoints.

`face_front` is required as a simple profile-photo checkpoint only. PC3 accepts
it when a front-facing face is visible in a decodable, non-dark image; it does
not perform identity recognition or send face features to PC2.

Baseline status:

```http
GET /api/baselines/users/{user_id}
```

PC3 requires only the simple profile face checkpoint and the front full-body
checkpoint before routine planning:

- `baseline.face.face_front.captured`
- `baseline.body.body_front_full.captured`

## 2. Pre-Exercise Routine Recommendation

```http
POST /api/routines/profile
Content-Type: application/json
```

PC1 sends its existing `RecommendationRequestPayload` shape:

```json
{
  "user_id": "profile_1",
  "profile": {
    "name": "Mirror User",
    "weight_kg": 70,
    "height_cm": 172,
    "goal": "lower_body_strength",
    "experience_level": "beginner",
    "weekly_frequency": "three_four",
    "limitations": ["knee"]
  },
  "baseline": {
    "ready": true,
    "completed_slots": [
      "face_front",
      "body_front_full"
    ]
  },
  "start_date": "2026-05-13",
  "purpose": "pre_exercise_routine"
}
```

PC3 validates required profile fields and confirms the saved PC3 baseline has
the required `face_front` and `body_front_full` checkpoints. PC3 then calls PC2 `/api/routine/profile` with a
sanitized payload.

PC3 also accepts the newer flat routine request shape:

```json
{
  "user_id": "profile_1",
  "profile_name": "Mirror User",
  "weight_kg": 70,
  "user_goal": "운동 습관 만들기",
  "exercise_experience": "초보",
  "available_days_per_week": 5,
  "restricted_body_parts": ["무릎"],
  "start_date": "2026-05-13",
  "purpose": "profile weekly routine"
}
```

PC3 response shape is PC1 `RecommendationResponsePayload`. PC3 stores the full
routine plan and generated routine days in its app DB before returning this
response:

```json
{
  "source": "ai",
  "difficulty": "easy",
  "title": "AI routine from PC2",
  "description": "Routine generated from your profile.",
  "reason_lines": ["Lower body control first."],
  "estimated_minutes": 10,
  "start_exercise_type": "squat",
  "items": [
    {
      "exercise_type": "squat",
      "title": "Day 1 - squat",
      "reps": 8,
      "rest_sec": 60,
      "focus": "controlled posture",
      "summary": "Build stable lower-body movement.",
      "sets": 3,
      "reason": "Practice stable knee tracking.",
      "how_to": "Stand tall, sit the hips back, then press through the feet.",
      "tips": "Keep knees tracking over toes."
    }
  ],
  "routine_id": "routine_abcd1234",
  "start_date": "2026-05-13",
  "scheduled_dates": ["2026-05-13", "2026-05-14"],
  "weekly_routine": [
    {
      "day_index": 1,
      "day_label": "Day 1",
      "focus": "lower body control",
      "exercises": [
        {
          "exercise": "squat",
          "sets": 3,
          "reps": 8,
          "duration_sec": null,
          "rest_sec": 60,
          "focus": "controlled posture",
          "reason": "Practice stable knee tracking.",
          "how_to": "Stand tall, sit the hips back, then press through the feet.",
          "tips": "Keep knees tracking over toes."
        }
      ]
    }
  ]
}
```

If PC2 is unavailable, PC3 returns `503`. If PC2 returns an invalid routine
response, PC3 returns `502`. PC3 does not create local fallback routines.

## 3. Date-Based Routine Lookup

```http
GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD
```

PC3 reads the selected day's routine from the PC3 app DB. It does not call PC2
again for day lookup:

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

If no stored routine day exists for that date, PC3 returns `404`.

## 4. Exercise Session

Start:

```http
POST /api/sessions/start
Content-Type: application/json
```

Request:

```json
{
  "user_id": "profile_1",
  "mode": "exercise",
  "goal": "pushup",
  "routine_id": "routine_abcd1234",
  "routine_day_id": 12
}
```

Supported `goal` values:

- `squat`
- `jumping_jack`
- `knee_raise`
- `lunge`
- `pushup`

Response includes a `ws_url` for realtime updates.

## 5. Realtime and Frame Analysis

WebSocket:

```text
WS /ws/sessions/{session_id}
```

Frame upload:

```http
POST /api/analyze/exercise
Content-Type: multipart/form-data
```

Form fields:

- `session_id`
- `file`

PC3 handles realtime feedback locally. PC2 is not called for every frame.

Frame cadence contract:

- PC1 must call `POST /api/analyze/exercise` continuously while the exercise
  session is running.
- Recommended fixed intervals:
  - `squat`, `pushup`, `lunge`: 300 ms.
  - `knee_raise`, `jumping_jack`: 200 ms.
- Recommended frame resolution:
  - Preferred: `1280x720` JPEG frames.
  - Minimum practical fallback: `960x540`.
  - Do not jump to `1920x1080` first. PC3 runs dual MediaPipe, so 720p is the
    current balance between landmark clarity and realtime latency.
- Do not use a slow interval such as 1500 ms for counting. PC3 counts repetitions
  from pose state transitions like `up -> down -> up`, so sparse frames can miss
  the transition and leave `count` unchanged.
- PC1 should keep its in-flight guard so it does not send overlapping frame
  uploads. If the previous upload is still running, skip the next scheduled frame.
- Preferred loop: upload a frame, wait for the response, then schedule the next
  upload after 150-300 ms based on the selected exercise. This adaptive loop is
  safer than piling up requests with a fixed interval.
- PC1 should log or display `state`, `count`, `posture_errors`, and
  `target_status` during integration checks.
- PC3 intentionally freezes count increases while the locked target is
  recovering/lost or while blocking posture errors are present.

Display contract:

- Large exercise counter: `exercise.count` from HTTP response or WebSocket.
- Main realtime guide: top-level `feedback` from HTTP response or WebSocket.
- User-visible warning: `exercise.target_status` and `exercise.posture_errors`.
- Measurement status: `exercise.measurement_quality` and `exercise.measurement_confidence`.
- Side counters: `exercise.count_left` and `exercise.count_right` for `knee_raise` and `lunge`.

Developer/debug-only fields:

- `person_count`
- `target_confidence`
- `detected_type`
- `exercise_confidence`
- `goal_mismatch`
- `knee_angle`
- `back_angle`
- `rep_phase`
- `active_side`

PC1 must ignore WebSocket messages whose `session_id` does not match the active
session. PC1 must not decrement or locally correct `count`; the PC3 value is the
source of truth.

PC1 must not send or require:

- Direct PC2 calls from the frontend.
- Deprecated baseline slots: `body_right_full`, `body_left_full`.
- Overlapping `/api/analyze/exercise` requests.
- Raw baseline claims without PC3 baseline validation.
- Raw landmarks, raw video, face feature, outfit feature, or PC2-only fields.

Example WebSocket update:

```json
{
  "type": "exercise_update",
  "session_id": "sess_abc",
  "count": 5,
  "state": "up",
  "feedback": "Keep the movement steady.",
  "posture_errors": ["knees_caving_in"],
  "stability_score": 0.74,
  "person_count": 2,
  "target_status": "multi_person_detected",
  "target_confidence": 0.91,
  "detected_type": "squat",
  "exercise_confidence": 0.88,
  "goal_mismatch": false,
  "measurement_quality": "dual_verified",
  "measurement_confidence": 0.86
}
```

## 6. Stop Session

```http
POST /api/sessions/{session_id}/stop
```

At stop time, PC3 finalizes the exercise feature and calls PC2
`/api/coach/generate`. Measurement quality is sent to PC2 as context; PC3 does
not replace PC2 with local guidance. PC2 connection failures return `503`;
invalid PC2 coaching responses return `502`.

Important response fields:

- `features.exercise.type`
- `features.exercise.count`
- `features.exercise.stability_score`
- `features.exercise.posture_errors`
- `features.exercise.measurement_quality`
- `features.exercise.measurement_confidence`
- `coaching.summary`
- `coaching.priority`
- `coaching.exercise_plan`
- `coaching.mirror_message`
- `coaching.pc2_payload`

## 7. Skip Session

```http
POST /api/sessions/{session_id}/skip
Content-Type: application/json
```

Optional request:

```json
{
  "reason": "user_cancelled"
}
```

Skip does not call PC2 and does not masquerade as a completed workout. PC3 stores
a `skipped` workout result in the app DB, then returns the current exercise
features with `coaching=null`.
