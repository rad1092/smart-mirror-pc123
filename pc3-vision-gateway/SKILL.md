# PC3 작업 경계

PC3는 스마트 미러의 Vision Gateway이자 사용자 앱 데이터 원장이다.

```text
PC1 UI -> PC3 Vision Gateway -> PC2 NVIDIA/RAG Engine
```

PC1은 PC3만 호출한다. PC3만 PC2를 호출한다.

## PC3 책임

- baseline 촬영과 저장
- 운동 세션 시작/중지/스킵
- 자세 분석과 WebSocket 업데이트
- 사용자 프로필 원장
- 루틴 플랜 원장
- 날짜별 루틴 원장
- 몸무게 기록 원장
- 운동 결과 원장
- 코칭 로그 원장
- PC2 루틴/코칭 생성 호출
- PC2 요청 payload whitelist
- PC2 timeout과 error mapping

## PC2 책임

PC2는 NVIDIA/RAG 생성 엔진이다.

- 루틴 JSON 생성
- 운동 후 코칭 JSON 생성
- 운동 지식 RAG
- embedding/rerank/chat 호출

PC3는 RAG, prompt, NVIDIA 호출, vector search를 직접 구현하지 않는다.

## PC1용 API

- `GET /api/users/profiles`
- `POST /api/users/profiles`
- `PUT /api/users/profiles/{user_id}`
- `DELETE /api/users/profiles/{user_id}`
- `GET /api/baselines/users/{user_id}`
- `POST /api/baselines/users/{user_id}/capture`
- `POST /api/routines/profile`
- `GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD`
- `GET /api/routines/profile/{user_id}/calendar?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
- `POST /api/users/{user_id}/body-metrics`
- `GET /api/users/{user_id}/progress?days=30`
- `GET /api/coach/logs/{user_id}?limit=100`
- `POST /api/sessions/start`
- `POST /api/sessions/{session_id}/stop`
- `POST /api/sessions/{session_id}/skip`

## PC2 payload 원칙

세션 종료 시 PC2로 보낼 수 있는 값:

- `user_id`
- `session_id`
- `routine_id`
- `routine_day_id`
- `mode`
- `event`
- `features.exercise.type`
- `features.exercise.count`
- `features.exercise.stability_score`
- `features.exercise.posture_errors`
- `features.exercise.duration_sec`
- `features.exercise.measurement_quality`
- `features.exercise.measurement_confidence`
- 허용된 baseline diff 값

PC2로 보내면 안 되는 값:

- raw frame
- video
- full landmarks
- segmentation
- person_count
- target_status
- count_left/count_right
- classifier_window
- PC1 UI-only state

## 금지

- PC1이 PC2를 직접 호출하게 만드는 변경
- 사용자 앱 데이터 원장을 PC2로 다시 옮기는 변경
- PC3 안에 mock routine/coaching 성공 응답 추가
- PC3 안에 local fallback routine/coaching 추가
- RAG/NVIDIA/vector search를 PC3로 이동
- raw image/video/landmark 장기 저장
- 로그인, 회원가입, JWT, OAuth, 권한 기능 추가
- 새 smoke/test/mock 파일 생성

## 환경값

```env
HOST=127.0.0.1
PORT=9000
PC2_COACH_API_URL=http://127.0.0.1:7000/api/coach/generate
PC2_ROUTINE_API_URL=http://127.0.0.1:7000/api/routine/profile
PC2_TIMEOUT_SECONDS=120
CORS_ALLOW_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,tauri://localhost
BASELINE_DB_PATH=./data/baselines.sqlite3
APP_DB_PATH=./data/app.sqlite3
```

## 확인

```powershell
uv run --with-requirements requirements.txt python -m pytest -q
curl http://127.0.0.1:9000/health
curl http://127.0.0.1:9000/api/users/profiles
```

PC2 live 검증 전에는 PC2 `/health`와 PC3 `/health`를 먼저 확인한다.
