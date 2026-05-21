# PC3 변경 이력

이 문서는 `git log`와 현재 작업 내용을 기준으로 PC3가 어떻게 바뀌었는지 정리합니다.

## 2026-05-19

### 연결 구조 고정

- 연결 구조를 `PC1 -> PC3 -> PC2`로 고정했습니다.
- PC1은 PC3만 호출합니다.
- PC3만 PC2 루틴/코칭 생성 API를 호출합니다.
- PC2가 없거나 실패하면 PC3는 mock이나 basic fallback으로 성공처럼 꾸미지 않습니다.

### PC3 저장 원장 전환

- PC3에 SQLite app DB를 추가했습니다.
- PC3가 사용자 프로필, 루틴, 날짜별 루틴, 몸무게, 운동 결과, 코칭 로그의 원본이 되도록 정리했습니다.
- 프로필 삭제 시 해당 사용자 앱 데이터와 baseline을 같이 삭제합니다.
- PC1 localStorage를 비워도 PC3 DB 기준으로 프로필과 기록을 다시 불러올 수 있는 구조로 바꿨습니다.

### 사용자 API 추가

- `GET /api/users/profiles`
- `POST /api/users/profiles`
- `PUT /api/users/profiles/{user_id}`
- `DELETE /api/users/profiles/{user_id}`
- `POST /api/users/{user_id}/body-metrics`
- `GET /api/users/{user_id}/progress`
- `GET /api/coach/logs/{user_id}`

PC1은 이 API들을 통해 프로필, 몸무게, progress, 코칭 로그를 PC3에서 가져옵니다.

### 루틴 저장 흐름

- `POST /api/routines/profile` 요청 시 PC3가 profile과 user history를 정리해서 PC2에 루틴 생성을 요청합니다.
- PC2 응답을 받은 뒤 routine plan과 routine days를 PC3 app DB에 저장합니다.
- `GET /api/routines/profile/{user_id}/day`와 `calendar`는 PC3 DB에서 반환합니다.
- 루틴 evidence, history summary, weekly adjustment를 PC1이 표시할 수 있게 보존합니다.

### 운동 완료와 코칭 저장

- session start에 `routine_id`, `routine_day_id`를 받을 수 있게 했습니다.
- session stop은 PC2 코칭을 호출하고, 받은 코칭과 운동 결과를 PC3 app DB에 저장합니다.
- session skip은 완료로 위장하지 않고 PC3 app DB에 `skipped` 운동 결과로 저장합니다.
- skip에서는 PC2 코칭을 호출하지 않습니다.

### PC2 payload 정리

- PC2로 보내는 exercise payload를 whitelist 방식으로 정리했습니다.
- `measurement_quality`, `measurement_confidence`, `routine_id`, `routine_day_id`를 전달합니다.
- raw frame, video, full landmarks, segmentation, person_count, target_status, classifier window, PC1 UI-only state는 PC2로 보내지 않습니다.

### CORS와 삭제

- PC1에서 프로필 삭제가 가능하도록 CORS method에 `PUT`, `DELETE`를 추가했습니다.
- PC1 delete 요청이 `failed to fetch`로 막히던 문제를 해결했습니다.

### 구조 정리

- PC3 local mock/fallback 루틴/코칭 성공 흐름을 제거했습니다.
- 오래된 trigger engine과 smoke script를 제거했습니다.
- PC3는 camera/baseline/session/gateway/app-store 역할만 유지합니다.

## 최근 커밋 흐름

- `docs: add pc1 pc3 connection setup`
  - PC1이 PC3만 보도록 연결 문서를 추가했습니다.
- `chore: increase pc2 timeout`
  - PC2 호출 대기 시간을 늘렸습니다.
- `docs: clarify pc1 ui contract`
  - PC1과 PC3의 UI/API 계약을 문서화했습니다.
- `feat: stabilize live exercise counting`
  - 실시간 운동 카운팅 흐름을 안정화했습니다.
- `feat: stabilize pc3 target tracking and frame contract`
  - 대상 추적과 frame 계약을 안정화했습니다.
- `fix: simplify baseline slot handling`
  - baseline slot 처리를 단순화했습니다.

## 현재 확인 기준

- `uv run --with-requirements requirements.txt python -m pytest -q`가 통과해야 합니다.
- PC3 `/api/users/profiles`가 PC3 DB 기준으로 프로필을 반환해야 합니다.
- 프로필 DELETE가 PC3 app DB와 baseline을 같이 정리해야 합니다.
- PC3 README와 SKILL은 “PC3 원장, PC2 생성 엔진” 구조와 충돌하지 않아야 합니다.
- `.env`, SQLite DB, 로그, tmp/cache 파일은 커밋하지 않습니다.
