# PC3 흐름 변경 정리

## 2026-05-14 17:24:59 +09:00 - PC2 호출 timeout 흐름

변경 후 PC2 호출 흐름:

```text
PC1
  -> PC3
      -> PC2 routine/coach/day API 호출
         timeout = 90초
      -> PC2 응답 수신
      -> PC1 화면용 응답으로 변환
```

중요한 점:

- PC3의 PC2 호출 방식은 그대로 `httpx.AsyncClient`를 사용한다.
- 운동 전 루틴, 날짜별 루틴, 운동 후 코칭 호출은 같은 `PC2_TIMEOUT_SECONDS` 값을 공유한다.
- 새 작업자는 `.env.example`의 `PC2_TIMEOUT_SECONDS=90`을 기준으로 로컬 `.env`를 맞추면 된다.
- timeout을 늘린 것은 PC2 LLM 생성 시간이 길어질 수 있기 때문이며, PC3의 JSON 정제/whitelist 계약은 바꾸지 않았다.

## 2026-05-14 16:39:25 +09:00 - PC1 UI/UX 계약 문서 흐름

추가된 문서 흐름:

```text
PC1 작업자 / PC1 Codex
  -> PC1_UI_CONTRACT.md 우선 확인
  -> docs/pc1_integration_guide.md로 API 세부 확인
  -> PC1 화면 구현
      -> baseline 2항목
      -> 루틴 추천
      -> 날짜별 루틴
      -> 운동 session + WebSocket + frame upload
      -> stop 결과 + coaching 표시
```

중요한 점:

- PC1은 PC2를 직접 호출하지 않고 PC3만 호출한다.
- PC1 화면의 count는 PC3 HTTP/WebSocket count를 그대로 표시한다.
- WebSocket 메시지는 현재 session id와 일치할 때만 반영한다.
- PC1은 `face_front`, `body_front_full` baseline만 사용한다.
- PC1은 `PC1_UI_CONTRACT.md`의 금지사항과 구현 체크리스트를 기준으로 UI/UX를 맞춘다.

## 2026-05-14 16:03:12 +09:00 - 라이브 5종 검증 후 운동 프레임 흐름

변경 후 PC1 운동 프레임 권장 흐름:

```text
PC1 webcam
  -> 1280x720 JPEG frame
  -> POST /api/analyze/exercise
  -> PC3 session_id별 analyze lock
  -> Lite target tracking
  -> Full pose measurement
  -> exercise goal 기준 count/state 계산
  -> 같은 결과로 HTTP response + WebSocket exercise_update
```

운동별 권장 주기:

```text
squat / pushup / lunge
  -> 300 ms

knee_raise / jumping_jack
  -> 200 ms
```

중요한 점:

- PC1은 이전 frame upload가 끝나기 전에 다음 upload를 겹쳐 보내면 안 된다.
- HTTP count와 WebSocket count는 같은 분석 결과에서 나와야 한다.
- `knee_raise`는 무릎이 완전히 내려온 뒤 다시 올라갈 때만 다음 반복으로 센다.
- `target_recovering`, `target_lost`, `person_too_far`, `partial_body`, `low_confidence`, `multi_person_detected`, `model_disagreement` 상태에서는 count 증가를 막고 기존 count/phase를 보존한다.
- 라이브 확인 기준 5종 모두 count가 증가했다. 남은 품질 이슈는 `pushup/lunge`의 카메라 위치에 따른 `target_lost`, 그리고 `lunge`의 detected type 오판이다.

이 문서는 Git 기록을 기준으로 PC3의 역할과 데이터 흐름이 어떻게 바뀌었는지 정리합니다.

## 현재 런타임 흐름

```text
PC1 프론트엔드
  -> PC3 Vision Gateway
      -> baseline 검증
      -> 루틴 요청 정규화
      -> pose 분석 및 target tracking
      -> session 측정 품질 판단
      -> PC2 요청 whitelist 정제
  -> PC2 Coach API
      -> 운동 전 루틴 생성
      -> 날짜별 루틴 조회
      -> 운동 후 코칭 생성
```

현재 구조에서 PC1은 PC2를 직접 호출하지 않습니다. PC3가 PC1과 PC2 사이의 계약 정렬, 검증, 변환, fallback을 담당합니다.

## 2026-05-14 13:50:34 +09:00 - 운동별 frame cadence 계약 보강

변경 후 PC1 프레임 업로드 정책:

```text
squat / pushup / lunge
  -> POST /api/analyze/exercise every 300 ms

knee_raise / jumping_jack
  -> POST /api/analyze/exercise every 200 ms

adaptive loop 권장
  -> frame upload
  -> response 완료 대기
  -> selected exercise 기준 150-300 ms 후 다음 upload
```

중요한 점:

- PC1은 이전 frame upload가 끝나기 전에 다음 upload를 겹쳐 보내면 안 됩니다.
- 이전 요청이 아직 진행 중이면 다음 예약 frame은 skip합니다.
- 빠른 운동인 `knee_raise`, `jumping_jack`은 300ms보다 200ms cadence가 count 전환을 더 잘 잡습니다.
- PC3 count는 연속 프레임의 state 전환을 보므로, PC1의 frame cadence는 API 모양만큼 중요한 계약입니다.

## 2026-05-14 13:46:25 +09:00 - target tracking grace와 frame cadence 계약 추가

변경 후 운동 중 흐름:

```text
PC1 exercise screen
  -> POST /api/sessions/start
      -> PC3가 ws_url 반환
  -> WebSocket 연결
  -> POST /api/analyze/exercise
      -> 300-500ms 간격으로 반복
      -> PC3가 locked target 기준으로 pose 분석
      -> count/state/feedback/target_status broadcast
  -> POST /api/sessions/{session_id}/stop
      -> 측정 품질이 충분하면 PC2 운동 후 코칭 호출
      -> 측정 품질이 낮으면 PC3 한국어 fallback 코칭 반환
```

중요한 점:

- PC3 count는 시간 기준 자동 증가가 아니라 `up -> down -> up` 같은 pose state 전환 기준입니다.
- PC1이 1500ms처럼 느리게 프레임을 보내면 down/up 전환을 놓쳐 count가 오르지 않을 수 있습니다.
- 짧은 인식 끊김은 `target_recovering`으로 처리하며 기존 count와 rep phase를 보존합니다.
- `TARGET_LOST_GRACE_FRAMES`를 넘길 때만 `target_lost`로 전환합니다.
- `target_recovering`, `target_lost`, `person_too_far`, `partial_body`, `low_confidence`, `model_disagreement` 상태에서는 count 증가만 막고 기존 측정값은 유지합니다.
- 다른 사람이 들어와도 새 target으로 자동 교체하지 않습니다. 새 target은 세션 재시작으로만 잡습니다.

## 2026-05-13 16:43:52 +09:00 - baseline 문구 단순화

변경 후 흐름:

```text
PC1 baseline capture
  -> face_front
  -> body_front_full
  -> PC3 baseline 완료
```

중요한 점:

- 문서와 화면 기준은 위 두 항목만 남기는 방향으로 정리합니다.
- 루틴 추천 전 baseline 검증도 위 두 checkpoint만 확인합니다.

## 2026-05-13 16:33:56 +09:00 - baseline 슬롯 계약 2개로 축소

변경 후 baseline 흐름:

```text
PC1 baseline capture
  -> face_front
      -> PC3가 이미지 decode
      -> 정면 얼굴 1개 이상 검출
      -> 프로필 사진용 checkpoint 저장
  -> body_front_full
      -> PC3가 MediaPipe pose/full-body visibility 검증
      -> 정면 전신 checkpoint 저장
```

중요한 점:

- PC3 baseline 슬롯은 `face_front`, `body_front_full` 두 개입니다.
- 루틴 추천 전 baseline 검증도 위 두 checkpoint만 확인합니다.

## 2026-05-13 14:17:01 +09:00 - 얼굴 baseline 흐름 단순화

변경 후 baseline 흐름:

```text
PC1 baseline capture
  -> face_front
      -> PC3가 이미지 decode
      -> 너무 어둡지 않은지 확인
      -> 정면 얼굴 1개 이상 검출
      -> 프로필 사진용 checkpoint 저장
  -> body_front_full
      -> PC3가 MediaPipe pose/full-body visibility 검증
      -> body checkpoint 저장
```

중요한 점:

- `face_front`는 계속 baseline 필수 슬롯입니다.
- `face_front`는 얼굴 신원 인증이나 상세 얼굴 분석이 아닙니다.
- PC3는 얼굴이 화면에 보이는지만 확인해 헬스장 회원 프로필 사진 같은 checkpoint로 저장합니다.
- PC2 운동/루틴 요청에는 얼굴 feature를 보내지 않습니다.
- body baseline과 운동 자세 분석 흐름은 기존대로 유지됩니다.

## 2026-05-13 12:01:16 +09:00 - 변경 문서 관리 흐름 추가

런타임 흐름 영향:

- PC1/PC2/PC3 API 동작 변경은 없습니다.
- 운동 분석, baseline, routine, PC2 호출 흐름 변경은 없습니다.

문서 관리 흐름:

```text
커밋/푸시 요청
  -> CHANGELOG.md 생성 또는 갱신
  -> FLOW_CHANGES.md 생성 또는 갱신
  -> 구현 변경과 문서 변경을 함께 커밋
```

## 초기 흐름

초기 PC3는 운동 전용 gateway라기보다 넓은 smart mirror gateway 성격이 있었습니다.

당시 흐름은 대략 다음과 같았습니다.

```text
camera/frame input
  -> PC3 broad analysis layer
      -> exercise feature
      -> face/grooming/outfit placeholder
  -> PC2 mixed coaching payload
```

이 구조는 현재 PC1/PC2 기준과 맞지 않았습니다. PC1은 운동 전용 화면이고, PC2는 `extra="forbid"` strict schema를 사용하기 때문입니다.

## Exercise-only 정리 이후 흐름

`a4a99b0` 커밋에서 PC3는 운동 전용 범위로 정리되었습니다.

변경 후 흐름:

```text
PC1 exercise frontend
  -> PC3 exercise-only gateway
      -> baseline slot checkpoint
      -> pose analysis
      -> session lifecycle
      -> WebSocket exercise update
  -> PC2 exercise coaching
```

런타임에서 제거된 것:

- face analysis
- outfit/color analysis
- grooming knowledge 문서
- segmentation placeholder
- non-exercise PC2 payload field

## PC1/PC2 운동 계약 정렬 흐름

`df07a8f` 커밋에서 PC3는 PC1/PC2 공통 운동 계약에 맞춰졌습니다.

주요 흐름:

- PC1 baseline capture:
  - `POST /api/baselines/users/{user_id}/capture`
- PC1 realtime update:
  - `count`
  - `state`
  - `feedback`
  - `posture_errors`
  - `stability_score`
- PC2 운동 후 코칭 요청:
  - `mode="exercise"`
  - `event="session_completed"`
  - `features.exercise`
  - optional `baseline_diff.exercise`
  - optional `environment`

PC3는 PC2로 다음 데이터를 보내지 않도록 막습니다.

- 원본 이미지
- base64 이미지
- 전체 landmark
- target tracking metadata
- measurement quality metadata
- PC1 화면 전용 field
- unknown field
- null field

## 자세 분석 확장 흐름

`041cbeb`, `5743931`, `b54a021`, `4f41f37` 커밋을 거치면서 PC3는 단순 squat 분석에서 다중 운동/다중 모델 측정 gateway로 바뀌었습니다.

현재 pose 분석 흐름:

```text
frame
  -> MediaPipe Lite fast pass
      -> person count
      -> target 후보
      -> target 연속성
  -> MediaPipe Full accurate pass
      -> landmark
      -> angle
      -> 운동별 state
      -> 반복 count 검증
  -> quality gate
      -> dual_verified / fast_only / model_disagreement / blocked
  -> PC1 realtime update
```

지원 운동:

- `squat`
- `jumping_jack`
- `knee_raise`
- `lunge`
- `pushup`

추가된 핵심 기능:

- 세션 시작 후 target user lock
- multi-person detection
- target lost/reconnect 처리
- 운동 타입 감지 정보
- goal mismatch flag
- PC2 호출 전 measurement quality guard

## 운동 전 루틴 플랜 흐름

`8d13a2d` 커밋에서 PC3에 운동 전 루틴 플랜 중계가 추가되었습니다.

초기 루틴 플랜 흐름:

```text
PC1 RecommendationRequestPayload
  -> PC3 /api/routines/profile
      -> profile 검증
      -> 저장된 baseline 검증
      -> PC2 /api/routine/profile 호출
      -> PC1 RecommendationResponsePayload 반환
```

중요한 점은 PC3가 PC1의 baseline claim만 믿지 않고, PC3 baseline DB에 실제로 `source="user"`인 필수 slot이 저장되어 있는지 다시 확인한다는 점입니다.

PC2가 없거나 실패하면 PC3는 `source="basic"`인 local fallback 루틴을 반환합니다.

## 최신 스케줄 루틴 흐름

`3f418a8` 커밋에서 PC3는 최신 PC2 스케줄 루틴 계약에 맞춰졌습니다.

현재 루틴 생성 흐름:

```text
PC1 nested RecommendationRequestPayload
또는 PC2 문서형 flat routine payload
  -> PC3 /api/routines/profile
      -> PC3 내부 표준 request로 normalize
      -> 저장된 user baseline 검증
      -> PC1 enum 값을 PC2 human-readable label로 변환
      -> start_date가 있으면 PC2로 전달
      -> PC2 /api/routine/profile 호출
      -> pc3_payload schedule metadata 보존
      -> weekly_routine 상세 정보 보존
      -> 기존 PC1 preview items와 확장 field를 함께 반환
```

새로 보존하는 필드:

- `routine_id`
- `start_date`
- `scheduled_dates`
- `weekly_routine`
- `how_to`
- `tips`

날짜별 루틴 조회 흐름:

```text
PC1
  -> PC3 GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD
  -> PC2 GET /api/routine/profile/{user_id}/day?target_date=YYYY-MM-DD
  -> PC3 normalized RoutineDayResponse
  -> PC1
```

오류 처리:

- PC2 404는 PC3에서도 404로 반환.
- PC2 연결 실패는 503으로 반환.
- 그 외 PC2 HTTP 실패는 502로 반환.

## 현재 PC3 책임 범위

현재 PC3가 담당하는 경계:

- PC1 호환:
  - baseline capture
  - routine recommendation
  - date routine lookup
  - realtime WebSocket update
  - session stop result
- Vision runtime:
  - MediaPipe Lite/Full 모델 사용
  - target tracking
  - 운동별 count/posture 분석
  - measurement quality guard
- PC2 호환:
  - strict request filtering
  - raw image forwarding 금지
  - unknown/null field forwarding 금지
  - routine schedule metadata 보존
  - PC2 unavailable fallback

## 현재 버전 스냅샷

- 현재 HEAD: `3f418a8`
- 현재 실질 버전:
  - PC3 exercise-only gateway
  - dual MediaPipe pose analysis
  - PC1 baseline/realtime/session 호환
  - PC2 운동 후 coaching 중계
  - PC2 스케줄 루틴 proxy 지원
