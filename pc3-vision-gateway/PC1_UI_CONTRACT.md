# PC1 UI/UX 계약 문서

문서 갱신 시각: `2026-05-14 16:39:25 +09:00`

이 문서는 PC1 프론트엔드 작업자와 PC1 쪽 Codex가 PC3 계약을 그대로 맞추기 위한 기준 문서입니다. PC1은 UI/UX와 카메라 프레임 업로드를 담당하고, PC3는 baseline 검증, 루틴 중계, 운동 자세 분석, WebSocket 업데이트, 운동 후 코칭 중계를 담당합니다.

## 1. 기본 원칙

- PC1은 PC2를 직접 호출하지 않습니다. 운동 전 플랜, 날짜별 루틴, 운동 후 코칭은 모두 PC3를 통해 요청합니다.
- PC1은 PC3가 반환한 `ws_url` 그대로 WebSocket에 연결합니다.
- PC1은 raw image/base64/video/landmark를 PC2로 보내지 않습니다. PC2 계약은 PC3가 정제합니다.
- PC1은 화면 표시용 필드가 추가되어도 기존 화면이 깨지지 않게 unknown field를 무시할 수 있어야 합니다.
- PC1은 deprecated baseline slot인 `body_right_full`, `body_left_full`을 사용하지 않습니다.

## 2. PC3 Base URL

로컬 개발:

```text
http://127.0.0.1:9000
```

PC1과 PC3가 다른 컴퓨터일 때:

```text
http://<PC3_LAN_IP>:9000
```

PC3 서버는 다음 환경 기준으로 실행되어야 합니다.

```env
HOST=0.0.0.0
WS_PUBLIC_HOST=<PC3_LAN_IP>
PORT=9000
```

## 3. Baseline 화면 계약

PC1 baseline 화면은 두 항목만 촬영합니다.

| 화면 항목 | PC3 `slot_type` | 의미 | UI 설명 |
| --- | --- | --- | --- |
| 얼굴 프로필 | `face_front` | 프로필 사진용 얼굴 체크 | 정면 얼굴이 보이게 촬영 |
| 전신 정면 | `body_front_full` | 운동 target 기준 전신 확인 | 머리부터 발끝까지 보이게 촬영 |

`face_front`는 신원 인증이 아닙니다. 얼굴 분석 feature도 PC2로 보내지 않습니다. PC3는 얼굴이 보이는지, 이미지가 읽히는지만 확인합니다.

`body_front_full`은 세션 시작 전 사용자를 전신 기준으로 잡기 위한 checkpoint입니다. 운동 중 target lock은 세션 첫 유효 pose 기준으로 다시 잡습니다.

요청:

```http
POST /api/baselines/users/{user_id}/capture
Content-Type: multipart/form-data
```

Form fields:

| field | value |
| --- | --- |
| `slot_type` | `face_front` 또는 `body_front_full` |
| `file` | JPEG/PNG 이미지 파일 |

응답:

```json
{
  "valid": true,
  "slot_type": "face_front",
  "reason": null
}
```

표시 기준:

- `valid=true`: 해당 baseline 항목 완료 처리.
- `valid=false`: `reason`을 사용자 안내 문구로 표시.
- HTTP `400`: 지원하지 않는 slot 또는 잘못된 이미지입니다.
- 원본 이미지는 PC3가 저장하지 않습니다.

Baseline 상태 조회:

```http
GET /api/baselines/users/{user_id}
```

루틴 요청 전에 PC3 DB에 다음 두 항목이 저장되어 있어야 합니다.

```text
baseline.face.face_front
baseline.body.body_front_full
```

PC1은 자기 화면 상태만 믿고 루틴을 열면 안 됩니다. PC3가 `POST /api/routines/profile`에서 다시 baseline 저장 여부를 검증합니다.

## 4. 운동 전 플랜 화면 계약

PC1은 프로필 입력값과 baseline 완료 상태를 PC3에 보냅니다.

```http
POST /api/routines/profile
Content-Type: application/json
```

권장 요청 shape:

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
    "completed_slots": ["face_front", "body_front_full"]
  },
  "start_date": "2026-05-14",
  "purpose": "pre_exercise_routine"
}
```

허용 enum:

| field | values |
| --- | --- |
| `profile.goal` | `build_stamina`, `posture_correction`, `lower_body_strength`, `build_habit`, `weight_management` |
| `profile.experience_level` | `beginner`, `casual`, `consistent` |
| `profile.weekly_frequency` | `once_twice`, `three_four`, `five_plus` |
| `profile.limitations[]` | `knee`, `back`, `shoulder`, `ankle` |

응답은 PC1 추천 루틴 화면에 바로 표시할 수 있는 shape입니다.

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
      "duration_sec": null,
      "reason": "Practice stable knee tracking.",
      "how_to": "Stand tall, sit the hips back, then press through the feet.",
      "tips": "Keep knees tracking over toes."
    }
  ],
  "routine_id": "routine_abcd1234",
  "start_date": "2026-05-14",
  "scheduled_dates": ["2026-05-14", "2026-05-15"],
  "weekly_routine": []
}
```

표시 기준:

- `source="ai"`: PC2 루틴이 성공적으로 반영된 상태입니다.
- `source="basic"`: PC2 실패 또는 fallback 상태입니다. PC1은 화면을 죽이지 말고 기본 루틴으로 시작 가능하게 보여줍니다.
- `items`는 추천 카드 목록에 사용합니다.
- `start_exercise_type`은 바로 운동 시작 버튼의 기본 운동 타입입니다.
- `routine_id`, `scheduled_dates`, `weekly_routine`, `how_to`, `tips`는 결과/날짜별 루틴 화면에서 보존합니다.

에러 기준:

- HTTP `409` + `detail.reason="baseline_incomplete"`: baseline 두 항목이 PC3 DB에 저장되지 않았습니다.
- HTTP `422`: 프로필 필수값 또는 enum이 잘못되었습니다.

## 5. 날짜별 루틴 화면 계약

PC1이 오늘/며칠차 루틴을 조회할 때 PC3를 호출합니다.

```http
GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD
```

응답:

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
  "message": "Today is pushup day.",
  "created_at": null
}
```

표시 기준:

- `message`: 오늘 루틴 안내 문구.
- `exercises[].exercise`: 운동 시작 시 `goal`로 넘길 운동 타입.
- `how_to`, `tips`: 운동 상세/도움말 UI에 표시.
- HTTP `404`: 해당 날짜 루틴이 없습니다.
- HTTP `503`: PC2 날짜별 루틴 API에 연결할 수 없습니다.

## 6. 운동 세션 화면 계약

지원 운동 타입은 다음 5개로 고정합니다.

```text
squat
jumping_jack
knee_raise
lunge
pushup
```

세션 시작:

```http
POST /api/sessions/start
Content-Type: application/json
```

요청:

```json
{
  "user_id": "profile_1",
  "mode": "exercise",
  "goal": "pushup"
}
```

응답:

```json
{
  "session_id": "sess_abc123",
  "user_id": "profile_1",
  "mode": "exercise",
  "goal": "pushup",
  "status": "running",
  "created_at": "2026-05-14T07:00:00Z",
  "updated_at": "2026-05-14T07:00:00Z",
  "ws_url": "ws://192.168.0.10:9000/ws/sessions/sess_abc123"
}
```

PC1은 `ws_url` 그대로 WebSocket을 연결합니다. PC1이 임의로 session id를 조합해서 WebSocket 주소를 만들지 않습니다.

## 7. 운동 프레임 업로드 계약

PC1은 세션이 running인 동안 카메라 프레임을 계속 업로드합니다.

```http
POST /api/analyze/exercise
Content-Type: multipart/form-data
```

Form fields:

| field | value |
| --- | --- |
| `session_id` | `POST /api/sessions/start`에서 받은 값 |
| `file` | JPEG 이미지 파일 |

권장 프레임:

| 항목 | 값 |
| --- | --- |
| 기본 해상도 | `1280x720` |
| 실사용 fallback | `960x540` |
| 포맷 | JPEG |
| orientation | PC1 화면 미러링과 무관하게 분석 프레임은 원본 방향 권장 |

권장 업로드 주기:

| 운동 | 주기 |
| --- | --- |
| `squat` | 300 ms |
| `pushup` | 300 ms |
| `lunge` | 300 ms |
| `knee_raise` | 200 ms |
| `jumping_jack` | 200 ms |

중요:

- 이전 `/api/analyze/exercise` 요청이 끝나기 전에 다음 프레임을 겹쳐 보내지 않습니다.
- 권장 구현은 adaptive loop입니다. 프레임 업로드 완료 후 운동별 150-300ms 뒤 다음 프레임을 보냅니다.
- `setInterval`을 쓰더라도 request-in-flight guard가 필요합니다.
- 1500ms 같은 느린 주기는 count 전환을 놓칠 수 있습니다.

HTTP 응답:

```json
{
  "session_id": "sess_abc123",
  "type": "exercise_update",
  "exercise": {
    "type": "pushup",
    "count": 4,
    "state": "up",
    "stability_score": 0.75,
    "posture_errors": [],
    "person_count": 1,
    "target_status": "tracking",
    "target_confidence": 0.84,
    "detected_type": "pushup",
    "exercise_confidence": 0.87,
    "goal_mismatch": false,
    "measurement_quality": "dual_verified",
    "measurement_confidence": 0.75,
    "count_left": null,
    "count_right": null,
    "squat_depth": null,
    "knee_angle": 159.1,
    "back_angle": 5.3,
    "duration_sec": null,
    "tempo": null,
    "rep_phase": "up",
    "active_side": null
  },
  "feedback": "좋아요. 움직임을 유지해 주세요."
}
```

PC1 화면 표시 권장:

| 필드 | 표시 위치 |
| --- | --- |
| `exercise.count` | 큰 카운터 |
| `exercise.state` | 디버그 또는 작은 상태 표시 |
| `feedback` | 실시간 안내 문구 |
| `exercise.posture_errors` | 사용자 안내/경고 |
| `exercise.stability_score` | 안정성 점수 |
| `exercise.target_status` | 사용자 추적 상태 |
| `exercise.measurement_quality` | 측정 품질 상태 |
| `exercise.count_left`, `exercise.count_right` | `knee_raise`, `lunge` 보조 표시 |

내부 로그 또는 개발자 UI 권장:

- `person_count`
- `target_confidence`
- `detected_type`
- `exercise_confidence`
- `goal_mismatch`
- `measurement_confidence`
- `knee_angle`
- `back_angle`
- `rep_phase`
- `active_side`

## 8. WebSocket 계약

연결:

```text
WS /ws/sessions/{session_id}
```

PC1은 start 응답의 `ws_url`로 연결합니다. WebSocket 메시지는 같은 session 기준 HTTP 응답과 같은 count를 표시해야 합니다.

메시지:

```json
{
  "type": "exercise_update",
  "session_id": "sess_abc123",
  "count": 4,
  "state": "up",
  "feedback": "좋아요. 움직임을 유지해 주세요.",
  "posture_errors": [],
  "stability_score": 0.75,
  "count_left": 2,
  "count_right": 2,
  "person_count": 1,
  "target_status": "tracking",
  "target_confidence": 0.84,
  "detected_type": "pushup",
  "exercise_confidence": 0.87,
  "goal_mismatch": false,
  "measurement_quality": "dual_verified",
  "measurement_confidence": 0.75
}
```

HTTP/WS 표시 규칙:

- PC1이 HTTP 응답과 WebSocket 메시지를 둘 다 받는 경우 같은 `session_id`만 반영합니다.
- 이전 세션의 WebSocket 메시지는 무시합니다.
- WebSocket count가 늦게 도착해도 같은 세션 기준 최신 count를 되돌리지 않습니다.
- `count`는 PC3가 계산한 값을 그대로 표시합니다. PC1에서 자체 증가시키지 않습니다.

## 9. Target/status 표시 계약

PC3는 세션 첫 유효 pose를 운동 target으로 고정합니다. 다른 사람이 들어와도 자동으로 target을 바꾸지 않습니다.

상태 표시 기준:

| code | PC1 안내 |
| --- | --- |
| `target_locked` | 사용자를 잡았습니다. |
| `tracking` | 사용자를 추적 중입니다. |
| `target_recovering` | 사용자를 다시 찾고 있어요. 화면 중앙에 잠시 멈춰 주세요. |
| `target_lost` | 처음 잡은 사용자를 놓쳤어요. 같은 사람이 화면 중앙에 다시 서거나 세션을 다시 시작해 주세요. |
| `multi_person_detected` | 다른 사람이 함께 잡혔어요. 운동하는 사람만 화면에 들어오게 해 주세요. |
| `person_too_far` | 몸이 너무 작게 보여요. 카메라에 조금 더 가까이 서 주세요. |
| `partial_body` | 머리부터 발끝까지 화면 안에 들어오도록 위치를 조정해 주세요. |
| `low_confidence` | 조명과 자세를 조정해 관절이 선명하게 보이게 해 주세요. |
| `model_disagreement` | 두 포즈 모델의 판정이 달라 카운트를 보류했어요. 자세를 또렷하게 유지해 주세요. |

위 상태에서는 count 증가가 막힐 수 있습니다. PC1은 이것을 오류 팝업처럼 끊지 말고, 운동 화면 안의 안내 문구로 표시합니다.

## 10. 운동별 UI 참고

공통:

- PC1은 선택된 `goal` 기준으로 화면 제목과 운동 안내를 표시합니다.
- `detected_type`은 참고 정보입니다. PC3 count는 session `goal` 기준 운동 로직을 우선 사용합니다.
- `goal_mismatch=true`이면 선택 운동과 실제 움직임이 다를 수 있다는 안내를 개발자 UI 또는 보조 안내로 표시할 수 있습니다.

운동별:

| 운동 | UI 참고 |
| --- | --- |
| `squat` | 무릎 각도, 깊이, 상체 기울기 안내 가능 |
| `jumping_jack` | 발 벌림과 팔 올림 동기화 안내 |
| `knee_raise` | `count_left`, `count_right` 좌우 균형 표시 가능 |
| `lunge` | `count_left`, `count_right` 좌우 반복 표시 가능 |
| `pushup` | 카메라가 바닥까지 보이게 배치해야 `target_lost`가 줄어듦 |

라이브 확인 결과:

| 운동 | 확인 결과 |
| --- | --- |
| `squat` | count 증가 확인 |
| `jumping_jack` | count 증가 확인 |
| `knee_raise` | HTTP/WS count `15/15`, gap `0`, `+2` 튐 없음 |
| `pushup` | HTTP/WS count `4/4`, gap `0`, `+2` 튐 없음 |
| `lunge` | HTTP/WS count `7/7`, left/right `4/3`, gap `0`, `+2` 튐 없음 |

주의:

- `pushup`, `lunge`는 카메라 위치가 나쁘면 후반에 `target_lost`가 뜰 수 있습니다.
- `lunge`는 `detected_type`이 `squat`으로 표시되는 경우가 있으나, session `goal=lunge`이면 count는 런지 로직으로 계산됩니다.

## 11. 운동 종료와 결과 화면 계약

운동 종료:

```http
POST /api/sessions/{session_id}/stop
```

응답:

```json
{
  "session_id": "sess_abc123",
  "status": "stopped",
  "features": {
    "exercise": {
      "type": "pushup",
      "count": 4,
      "state": "idle",
      "stability_score": 0.75,
      "posture_errors": [],
      "measurement_quality": "pc2_ready",
      "measurement_confidence": 0.8
    }
  },
  "baseline_diff": {},
  "environment": null,
  "coaching": {
    "summary": "오늘 운동 요약",
    "priority": "normal",
    "routine": [],
    "exercise_plan": [],
    "mirror_message": "다음 세트도 같은 자세로 이어가세요.",
    "warnings": [],
    "pc2_payload": {
      "message": "표시용 메시지",
      "display_lines": ["운동 결과 요약"]
    }
  }
}
```

표시 기준:

- 결과 화면의 운동 타입/횟수/품질은 `features.exercise` 기준으로 표시합니다.
- 코칭 문구는 `coaching.summary`, `coaching.mirror_message`, `coaching.pc2_payload.display_lines`를 우선 사용합니다.
- `coaching`이 `null`이면 운동 결과만 표시하고, 코칭 생성 실패 안내를 보조 문구로 표시합니다.
- `measurement_quality`가 낮으면 PC3가 PC2 호출을 건너뛰고 local fallback coaching을 반환할 수 있습니다.

## 12. PC1 금지사항 체크리스트

PC1 작업자는 아래를 하지 않습니다.

- PC2 `/api/routine/profile`, `/api/routine/profile/{user_id}/day`, `/api/coach/generate` 직접 호출.
- `body_right_full`, `body_left_full` baseline 요구.
- PC1 화면 state만 믿고 baseline 완료 처리.
- `/api/analyze/exercise` 요청 겹쳐 보내기.
- WebSocket 이전 세션 메시지를 현재 세션 count에 반영.
- PC1에서 count를 자체 계산하거나 보정.
- PC3에 `face/outfit/raw_landmarks/base64_video` 같은 PC2 비허용 필드를 보내기.
- 측정 품질이 낮은 상태를 오류로만 처리하고 사용자가 조정할 안내를 숨기기.

## 13. PC1 쪽 Codex 구현 체크리스트

- [ ] PC3 base URL을 환경값으로 둔다.
- [ ] baseline 화면은 `face_front`, `body_front_full` 두 항목만 둔다.
- [ ] 루틴 추천은 PC3 `POST /api/routines/profile`만 호출한다.
- [ ] 날짜별 루틴은 PC3 `GET /api/routines/profile/{user_id}/day`만 호출한다.
- [ ] 운동 시작 시 PC3 `POST /api/sessions/start`를 호출하고 응답의 `ws_url`로 연결한다.
- [ ] 운동 프레임은 JPEG `1280x720` 기본, 성능 문제 시 `960x540`으로 보낸다.
- [ ] 운동별 업로드 주기를 적용한다.
- [ ] request-in-flight guard로 중복 업로드를 막는다.
- [ ] HTTP 응답과 WebSocket 메시지는 같은 `session_id`만 반영한다.
- [ ] 큰 count 표시는 PC3 `count` 값만 사용한다.
- [ ] `target_status`와 `posture_errors`는 한국어 안내로 표시한다.
- [ ] 종료 후 `features.exercise`와 `coaching`을 결과 화면에 표시한다.
- [ ] PC2 직접 호출 코드는 추가하지 않는다.
