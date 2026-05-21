# PC1 Smart Mirror UI

PC1은 스마트 미러의 화면 앱입니다. 프로필 생성, 카메라 화면, 운동 홈, 운동 진행, 결과와 코칭 표시만 담당합니다.

런타임 연결은 항상 아래 구조로 고정합니다.

```text
PC1 UI -> PC3 Vision Gateway -> PC2 NVIDIA/RAG Engine
```

PC1은 PC3만 호출합니다. PC1에서 PC2, NVIDIA API, DB를 직접 호출하지 않습니다.

## 설치 파일 만들기

PC1을 다른 컴퓨터에 설치하기 전, `.env`에서 PC3 주소를 맞춥니다.

```env
VITE_PC3_URL=http://<PC3_LAN_IP>:9000
VITE_DEVICE_ID=mirror_001
```

로컬에서 PC1, PC2, PC3를 모두 같은 컴퓨터에 띄울 때는 아래처럼 둡니다.

```env
VITE_PC3_URL=http://127.0.0.1:9000
VITE_DEVICE_ID=mirror_001
```

Windows에서 저장소 최상단의 파일을 더블클릭합니다.

```text
Build-PC1-Installer.cmd
```

빌드가 끝나면 저장소 최상단에 설치 파일이 생깁니다.

```text
SmartMirror-PC1-Setup.exe
```

이 설치 파일을 실행하면 바탕화면에 `Smart Mirror` 바로가기가 생성됩니다.

중요: Tauri 설치 파일에는 `VITE_PC3_URL` 값이 빌드 시점에 들어갑니다. PC3 IP가 바뀌면 `.env`를 수정한 뒤 설치 파일을 다시 만들어야 합니다.

## 개발 실행

```powershell
cd C:\groom\pc1-smart-mirror
npm install
npm run tauri -- dev
```

빌드 확인만 할 때는 아래 명령을 사용합니다.

```powershell
npm run build
```

## PC3 계약을 깨면 안 되는 지점

UI를 갈아엎거나 화면을 분해해도 아래 계약은 유지해야 합니다.

- API base는 `VITE_PC3_URL` 하나만 사용합니다.
- `VITE_PC2`, `PC2_URL`, `localhost:7000`, `127.0.0.1:7000` 같은 PC2 직접 연결을 추가하지 않습니다.
- 프로필 원본은 PC3입니다. `GET/POST/PUT/DELETE /api/users/profiles`를 사용합니다.
- `sm_profiles` localStorage를 프로필 원본으로 되살리지 않습니다. localStorage는 마지막 선택 프로필 캐시 정도만 허용합니다.
- 프로필 enum은 PC3 계약값만 보냅니다.
  - goal: `build_stamina`, `posture_correction`, `lower_body_strength`, `build_habit`, `weight_management`
  - experience_level: `beginner`, `casual`, `consistent`
  - weekly_frequency: `once_twice`, `three_four`, `five_plus`
  - limitations: `knee`, `back`, `shoulder`, `ankle`
- 제한 부위에서 “없음”은 `none` 문자열로 보내지 않고 빈 배열 `[]`로 보냅니다.
- baseline slot은 `face_front`, `body_front_full`을 유지합니다.
- 오늘 루틴으로 운동을 시작할 때 `routine_id`, `routine_day_id`를 `/api/sessions/start`에 전달합니다.
- 운동 완료 후 PC3가 내려준 `pc2_payload.display_lines`와 `pc2_payload.evidence`를 그대로 표시합니다.
- 루틴 근거, 코칭 근거, `weekly_adjustment`는 PC1에서 판단하지 않고 PC3 응답을 표시만 합니다.

## PC1이 사용하는 PC3 API

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

## 현재 UI 흐름

1. 프로필 목록을 PC3에서 불러옵니다.
2. 프로필을 만들면 PC3에 저장하고 상세 설정 화면으로 이동합니다.
3. 프로필을 누르면 운동 홈으로 이동합니다.
4. 운동 홈에서 오늘 루틴, 기간 달력, 몸무게 변화, 운동 요약, 최근 코칭, 루틴/코칭 근거를 보여줍니다.
5. 루틴이 없으면 PC3에 새 주간 루틴 생성을 요청합니다.
6. 운동 화면은 현재 운동, 전체 운동 수, 다음 운동, 휴식 구간, 스킵 버튼을 보여줍니다.
7. 운동 완료 후 코칭을 즉시 HUD와 결과 화면에 표시합니다.

## 카메라

PC1은 Windows에서 인식되는 기본 웹캠을 사용합니다. 노트북 내장 웹캠과 USB 웹캠 모두 사용할 수 있습니다.

카메라가 열리지 않으면 아래를 확인합니다.

- Windows 카메라 권한
- 다른 앱의 카메라 점유 여부
- PC1 앱 재실행

## 변경 이력

이번 브랜치의 변경 흐름은 [CHANGELOG.md](CHANGELOG.md)에 정리했습니다.
