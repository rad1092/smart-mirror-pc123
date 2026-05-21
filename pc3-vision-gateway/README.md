# PC3 Smart Mirror Vision Gateway

PC3는 PC1이 바라보는 단일 API 서버입니다. 카메라 baseline, 운동 세션, 자세 분석, WebSocket, 사용자 앱 데이터 저장, PC2 호출을 담당합니다.

런타임 연결은 아래 구조로 고정합니다.

```text
PC1 UI -> PC3 Vision Gateway -> PC2 NVIDIA/RAG Engine
```

PC1은 PC3만 호출합니다. PC2를 직접 호출하지 않습니다. PC3만 PC2를 호출합니다.

## 현재 저장 책임

PC3가 사용자 앱 데이터의 원본입니다.

- 사용자 프로필
- baseline 상태
- 루틴 플랜
- 날짜별 루틴
- 몸무게 기록
- 운동 결과
- 코칭 로그

PC2는 NVIDIA/RAG 생성 엔진입니다. 루틴과 코칭 JSON을 만들어주지만, PC1 화면에서 다시 불러와야 하는 사용자 데이터의 원본은 PC3 SQLite app DB입니다.

## 로컬 실행 구조

같은 컴퓨터에서 PC1, PC2, PC3를 모두 띄울 때 기본값입니다.

```text
PC1 UI: http://localhost:1420
PC2 API: http://127.0.0.1:7000
PC3 API: http://127.0.0.1:9000
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
PC2_COACH_API_URL=http://127.0.0.1:7000/api/coach/generate
PC2_ROUTINE_API_URL=http://127.0.0.1:7000/api/routine/profile
PC2_TIMEOUT_SECONDS=120
CORS_ALLOW_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,tauri://localhost
BASELINE_DB_PATH=./data/baselines.sqlite3
APP_DB_PATH=./data/app.sqlite3
```

## 물리 분리 연결법

나중에 PC1, PC2, PC3가 서로 다른 컴퓨터로 나뉘면 IP만 바꿉니다.

PC1 `.env`:

```env
VITE_PC3_URL=http://<PC3_LAN_IP>:9000
VITE_DEVICE_ID=mirror_001
```

PC3 `.env`:

```env
HOST=<PC3_LAN_IP>
PORT=9000
WS_PUBLIC_HOST=<PC3_LAN_IP>
PC2_COACH_API_URL=http://<PC2_LAN_IP>:7000/api/coach/generate
PC2_ROUTINE_API_URL=http://<PC2_LAN_IP>:7000/api/routine/profile
PC2_TIMEOUT_SECONDS=120
CORS_ALLOW_ORIGINS=http://<PC1_LAN_ORIGIN>:1420,tauri://localhost
```

PC2는 `<PC2_LAN_IP>:7000`에서 실행되어야 합니다.

중요: PC1 Tauri 설치 파일에는 `VITE_PC3_URL`이 빌드 시점에 들어갑니다. PC3 IP가 바뀌면 PC1 설치 파일을 다시 빌드해야 합니다.

## PC3 실행

```powershell
cd C:\groom\pc3-vision-gateway
uv run --with-requirements requirements.txt python -m uvicorn app.main:app --host 127.0.0.1 --port 9000 --reload
```

물리 분리 상태에서 외부 PC1이 접속해야 하면 `--host <PC3_LAN_IP>` 또는 `--host 0.0.0.0`로 실행합니다.

## PC1이 호출하는 API

### 사용자 프로필

- `GET /api/users/profiles`
- `POST /api/users/profiles`
- `PUT /api/users/profiles/{user_id}`
- `DELETE /api/users/profiles/{user_id}`

프로필 삭제는 해당 사용자 앱 데이터와 baseline을 같이 삭제합니다. 별도 이중 확인은 PC3에서 만들지 않습니다.

### Baseline

- `GET /api/baselines/users/{user_id}`
- `POST /api/baselines/users/{user_id}/capture`

PC3는 baseline 측정값과 slot 상태만 저장합니다. raw image를 장기 저장하지 않습니다.

### 루틴과 달력

- `POST /api/routines/profile`
- `GET /api/routines/profile/{user_id}/day?target_date=YYYY-MM-DD`
- `GET /api/routines/profile/{user_id}/calendar?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`

루틴 생성 시 PC3는 PC2에 생성 요청을 보낸 뒤, 받은 루틴과 날짜별 루틴을 PC3 app DB에 저장합니다. 이후 day/calendar 조회는 PC3 DB에서 반환합니다.

### 기록과 코칭

- `POST /api/users/{user_id}/body-metrics`
- `GET /api/users/{user_id}/progress?days=30`
- `GET /api/coach/logs/{user_id}?limit=100`

body metric, progress, coach logs는 PC3 app DB 기준으로 반환합니다.

### 운동 세션

- `POST /api/sessions/start`
- `POST /api/sessions/{session_id}/stop`
- `POST /api/sessions/{session_id}/skip`
- `GET /api/sessions/{session_id}/result`
- `ws://<PC3_HOST>:9000/ws/sessions/{session_id}`

session stop은 PC2에 코칭을 요청하고, 받은 코칭과 운동 결과를 PC3 app DB에 저장합니다.

session skip은 완료로 위장하지 않습니다. PC2 코칭을 호출하지 않고 PC3 app DB에 `skipped` 운동 결과로 저장합니다.

## PC2로 보내는 값

PC3는 PC2에 필요한 값만 보냅니다.

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

PC3는 raw frame, video, full landmarks, segmentation, person count, target status, classifier window, PC1 UI-only state를 PC2로 보내지 않습니다.

## 저장 파일

기본 저장 경로:

- baseline DB: `data/baselines.sqlite3`
- app DB: `data/app.sqlite3`

이 DB 파일은 로컬 런타임 데이터입니다. Git에 올리지 않습니다.

## 검증

```powershell
uv run --with-requirements requirements.txt python -m pytest -q
curl http://127.0.0.1:9000/health
curl http://127.0.0.1:9000/api/users/profiles
```

PC3는 PC2 없이 루틴/코칭을 성공처럼 꾸미지 않습니다. PC2가 없거나 실패하면 루틴/코칭 생성은 502/503 계열로 실패하는 것이 정상입니다.

## 변경 이력

이번 정리 흐름은 [CHANGELOG.md](CHANGELOG.md)에 정리했습니다.
