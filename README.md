# 스마트 미러 PC1-PC2-PC3 통합 저장소

이 저장소는 스마트 미러 프로젝트의 세 실행 단위를 하나의 Git 저장소로 정리한 통합본입니다.

- `pc1-smart-mirror`: 사용자 화면과 카메라 흐름을 담당하는 PC1 클라이언트
- `pc2-smart-mirror-aiot-coaching`: 운동 루틴과 코칭 문장을 생성하는 PC2 AI 코칭 서버
- `pc3-vision-gateway`: 자세 분석, 사용자 데이터, PC1/PC2 연동을 담당하는 PC3 비전 게이트웨이

루트의 `run-pc123-local.ps1`, `stop-pc123-local.ps1`, `test-pc123-local.ps1` 스크립트는 세 구성요소를 같은 장비에서 확인할 때 쓰는 보조 스크립트입니다.

## 원본 출처

아래 세 저장소의 최신 스냅샷을 하나로 묶었습니다. 각 하위 폴더의 기존 원격 연결은 제거했고, 현재부터는 이 통합 저장소에서 함께 관리합니다.

- PC1: [smart-mirror-exercise-only](https://github.com/dpgns9983-dot/smart-mirror-exercise-only)
  - 가져온 브랜치: `pc1/ui-review-installer-setup`
  - 가져온 커밋: `73bfabf`
- PC2: [smart-mirror-aiot-coaching](https://github.com/tmdwn0196-osj/smart-mirror-aiot-coaching)
  - 가져온 브랜치: `pc2/rag-gateway-engine`
  - 가져온 커밋: `4fbe29a`
- PC3: [smart-mirror-aiot-coaching](https://github.com/rad1092/smart-mirror-aiot-coaching)
  - 가져온 브랜치: `main`
  - 가져온 커밋: `672dc8c`

## 폴더 구조

```text
.
├── pc1-smart-mirror/
├── pc2-smart-mirror-aiot-coaching/
├── pc3-vision-gateway/
├── PC123_CONNECTION.md
├── run-pc123-local.ps1
├── stop-pc123-local.ps1
└── test-pc123-local.ps1
```

## 실행 전 설정

실제 실행 환경 값은 각 폴더의 `.env.example`을 기준으로 `.env`를 만들어 넣습니다. `.env`, 가상환경, `node_modules`, 빌드 결과물, 캐시 파일은 새 저장소에 올리지 않습니다.

세부 실행 방법은 각 폴더 안의 기존 `README.md`와 루트의 `PC123_CONNECTION.md`를 기준으로 확인하면 됩니다.
