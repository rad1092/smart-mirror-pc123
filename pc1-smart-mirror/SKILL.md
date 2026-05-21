# PC1 작업 경계

PC1은 스마트 미러의 Tauri + React 화면 앱이다.

```text
PC1 UI -> PC3 Vision Gateway -> PC2 NVIDIA/RAG Engine
```

PC1은 `VITE_PC3_URL`로 지정된 PC3 주소만 알면 된다. PC2, NVIDIA, DB를 직접 호출하지 않는다.

## PC1 책임

- 프로필 목록/생성/삭제 화면
- 프로필 상세 입력 화면
- baseline 촬영 UI
- 운동 홈 화면
- 오늘 루틴, 달력, 몸무게, progress, coach logs 표시
- 운동 카메라 화면
- 운동 구간, 휴식, 스킵, 완료 흐름 표시
- 운동 완료 후 코칭과 evidence 표시
- 설치 파일 빌드 흐름 유지

## PC3 계약

PC1이 직접 호출할 수 있는 대상은 PC3 API뿐이다.

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

## 프로필 계약값

- goal: `build_stamina`, `posture_correction`, `lower_body_strength`, `build_habit`, `weight_management`
- experience_level: `beginner`, `casual`, `consistent`
- weekly_frequency: `once_twice`, `three_four`, `five_plus`
- limitations: `knee`, `back`, `shoulder`, `ankle`

`none`은 전송하지 않는다. 제한 없음은 빈 배열 `[]`로 보낸다.

## 금지

- PC2 직접 호출
- `VITE_PC2`, `PC2_URL`, `localhost:7000`, `127.0.0.1:7000` 추가
- PC1 localStorage를 프로필 원본으로 사용
- PC1에서 루틴/코칭 판단 로직 생성
- NVIDIA 키, DB 설정, RAG 설정 추가
- 새 smoke/test/mock 파일 생성

## 확인

```powershell
npm run build
rg "127\\.0\\.0\\.1:7000|localhost:7000|VITE_PC2|PC2_URL" src .env .env.example
```
