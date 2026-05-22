# PC3 Smart Mirror Vision Gateway

PC3는 PC1이 바라보는 단일 API 서버이자 사용자 운동 데이터의 로컬 원장입니다. PC1은 PC3만 호출하고, PC3만 PC2의 NVIDIA/RAG 생성 API를 호출합니다.

```text
PC1 UI -> PC3 Vision Gateway -> PC2 NVIDIA/RAG Engine
```

## 현재 책임

PC3가 직접 담당하는 일:

- PC1 프로필, baseline, 루틴, 날짜별 루틴, 몸무게, 운동 결과, 코칭 로그 저장
- baseline 이미지 검증과 baseline slot 상태 저장
- MediaPipe 기반 운동 자세 분석, repetition count, WebSocket 실시간 업데이트
- PC2 루틴/코칭 요청 payload 정제
- PC2 응답을 PC1 화면용 JSON으로 변환하고 PC3 SQLite DB에 저장

PC3가 하지 않는 일:

- PC1에서 PC2를 직접 호출하게 만들지 않음
- raw frame, video, full landmarks, face feature를 PC2로 전달하지 않음
- PC2가 없을 때 local mock/fallback 루틴이나 코칭을 성공처럼 반환하지 않음
- 날짜별 루틴, progress, coach log 조회를 매번 PC2로 proxy하지 않음

현재 활성 PC2 호출은 다음 두 흐름입니다.

- `POST /api/routine/profile`: 운동 전 루틴 생성
- `POST /api/coach/generate`: 운동 완료 후 코칭 생성

루틴 생성 뒤의 day/calendar 조회, body metric, progress, coach log는 PC3 app DB 기준으로 반환합니다.

## 로컬 실행

PC1, PC2, PC3를 같은 컴퓨터에서 띄울 때 기본 주소입니다.

```text
PC1 UI: http://localhost:1420
PC2 API: http://127.0.0.1:7000
PC3 API: http://127.0.0.1:9000
```

PC3 실행:

```powershell
cd C:\groom\pc3-vision-gateway
uv run --with-requirements requirements.txt python -m uvicorn app.main:app --host 127.0.0.1 --port 9000 --reload
```

PC1 `.env`:

```env
VITE_PC3_URL=http://127.0.0.1:9000
VITE_DEVICE_ID=mirror_001
```

PC3 `.env`:

```env
HOST=127.0.0.1
PORT=9000
PC2_ROUTINE_API_URL=http://127.0.0.1:7000/api/routine/profile
PC2_COACH_API_URL=http://127.0.0.1:7000/api/coach/generate
PC2_TIMEOUT_SECONDS=90
CORS_ALLOW_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,tauri://localhost
BASELINE_DB_PATH=./data/baselines.sqlite3
APP_DB_PATH=./data/app.sqlite3
```

## 분리 PC 연결

PC1, PC2, PC3가 서로 다른 컴퓨터에서 실행되면 PC3는 외부 접속을 받도록 열고, PC1에는 PC3 LAN 주소를 넣습니다.

PC1 `.env`:

```env
VITE_PC3_URL=http://<PC3_LAN_IP>:9000
VITE_DEVICE_ID=mirror_001
```

PC3 `.env`:

```env
HOST=0.0.0.0
PORT=9000
WS_PUBLIC_HOST=<PC3_LAN_IP>
PC2_ROUTINE_API_URL=http://<PC2_LAN_IP>:7000/api/routine/profile
PC2_COACH_API_URL=http://<PC2_LAN_IP>:7000/api/coach/generate
PC2_TIMEOUT_SECONDS=90
CORS_ALLOW_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,tauri://localhost
```

PC2 LLM 응답이 느린 환경에서는 로컬 `.env`에서 `PC2_TIMEOUT_SECONDS=120`처럼 늘릴 수 있습니다. 코드 기본값과 `.env.example` 기준값은 90초입니다.

중요: PC1 Tauri 설치 파일에는 `VITE_PC3_URL`이 빌드 시점에 들어갑니다. PC3 IP가 바뀌면 PC1 설치 파일도 다시 빌드해야 합니다.

## PC1 API

### Health

- `GET /health`

### 사용자 프로필과 기록

- `GET /api/users/profiles`
- `POST /api/users/profiles`
- `PUT /api/users/profiles/{user_id}`
- `DELETE /api/users/profiles/{user_id}`
- `POST /api/users/{user_id}/body-metrics`
- `GET /api/users/{user_id}/progress?days=30`
- `GET /api/coach/logs/{user_id}?limit=100`

프로필 삭제는 PC3 app DB의 사용자 데이터와 baseline DB의 사용자 baseline을 같이 삭제합니다.

### Baseline

- `GET /api/baselines/users/{user_id}`
- `POST /api/baselines/users/{user_id}`
- `POST /api/baselines/users/{user_id}/capture`

PC1 화면에서 필요한 baseline slot은 `face_front`, `body_front_full` 두 개입니다. PC3는 baseline 측정값과 slot 상태만 저장하고 원본 이미지를 장기 저장하지 않습니다.

### 루틴과 달력

- `POST /api/routines/profile`
- `GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD`
- `GET /api/routines/profile/{user_id}/calendar?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`

`POST /api/routines/profile`은 PC2에 루틴 생성을 요청합니다. 성공하면 PC3가 routine plan과 routine days를 app DB에 저장합니다. 이후 day/calendar 조회는 PC2가 아니라 PC3 DB에서 반환합니다.

### 운동 세션

- `POST /api/sessions/start`
- `POST /api/sessions/{session_id}/stop`
- `POST /api/sessions/{session_id}/skip`
- `GET /api/sessions/{session_id}/result`
- `ws://<PC3_HOST>:9000/ws/sessions/{session_id}`

`stop`은 PC2에 코칭을 요청하고, 받은 코칭과 운동 결과를 PC3 app DB에 저장합니다. PC2가 실패하면 502/503 계열로 실패합니다.

`skip`은 PC2 코칭을 호출하지 않고 PC3 app DB에 `skipped` 운동 결과를 저장합니다.

### 실시간 분석과 센서

- `POST /api/analyze/exercise`
- `POST /api/sensors/update`

PC3는 frame 분석 결과를 HTTP response와 WebSocket에 같은 session 기준으로 전달합니다. PC1은 count를 자체 보정하지 않고 PC3 값을 그대로 표시합니다.

## PC2로 보내는 값

PC3는 운동 완료 코칭 요청에서 PC2에 필요한 값만 보냅니다.

- `user_id`
- `session_id`
- `routine_id`
- `routine_day_id`
- `mode`
- `event`
- `features.exercise.type`
- `features.exercise.count`
- `features.exercise.state`
- `features.exercise.stability_score`
- `features.exercise.posture_errors`
- `features.exercise.duration_sec`
- `features.exercise.measurement_quality`
- `features.exercise.measurement_confidence`
- 허용된 `baseline_diff.exercise` 값
- 선택적 environment 값

PC3는 raw frame, video, full landmarks, segmentation, person count, target status, classifier window, PC1 UI-only state를 PC2로 보내지 않습니다.

## 저장 파일

기본 저장 경로:

- baseline DB: `data/baselines.sqlite3`
- app DB: `data/app.sqlite3`

SQLite DB, `.env`, 로그, cache, model build output은 로컬 런타임 데이터입니다. Git에 올리지 않습니다.

## 검증

```powershell
uv run --with-requirements requirements.txt python -m pytest -q
curl http://127.0.0.1:9000/health
curl http://127.0.0.1:9000/api/users/profiles
```

PC2가 꺼져 있으면 루틴 생성과 운동 완료 코칭은 실패하는 것이 정상입니다. PC3는 성공처럼 꾸민 mock 응답을 만들지 않습니다.

## 관련 문서

- [CHANGELOG.md](CHANGELOG.md): PC3 변경 이력
- [PC1_UI_CONTRACT.md](PC1_UI_CONTRACT.md): PC1 화면/연동 계약
- [docs/pc1_integration_guide.md](docs/pc1_integration_guide.md): PC1 개발 연동 세부
- [docs/pc2_integration_guide.md](docs/pc2_integration_guide.md): PC2 payload 계약
