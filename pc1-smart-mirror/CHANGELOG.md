# 변경 이력 (Changelog)

이 파일은 PC1 Smart Mirror UI 의 모든 주요·세부 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/) 를 따르고, 커밋은 [Conventional Commits](https://www.conventionalcommits.org/) 스타일을 사용합니다.

작은 작업까지 빠짐없이 남기기 위해 다음 두 시점으로 정리되어 있습니다.

1. **버전별 요약** — 사용자가 체감하는 변화 기준 (Added / Changed / Fixed / Removed)
2. **개발 히스토리 (커밋 단위)** — 어느 날 어떤 파일에 무엇이 들어갔는지 빠짐없이 기록

---

## [0.1.0] - 2026-05-22

발표 직후 포트폴리오용으로 저장소를 정리한 첫 공개 버전입니다.
약 4주(2026-04-27 ~ 05-22) 동안 초기 커밋부터 문서·표현 정리 커밋까지 총 31개의 커밋이 누적되었습니다.

### Added (추가)

#### 화면 & 흐름
- 프로필 선택 화면 ([src/pages/ProfileSelectPage.tsx](src/pages/ProfileSelectPage.tsx))
  - 등록된 프로필 카드 목록, 새 프로필 만들기, 마지막 사용 프로필 자동 선택
  - 프로필별 사진 (`profilePhoto` 로컬 저장)과 마지막 사용 시각 표시
- 기본 정보 입력 화면 ([src/pages/ProfileInputPage.tsx](src/pages/ProfileInputPage.tsx))
  - 키·몸무게·운동 목표·경험 수준·주간 운동 빈도·신체 제약 입력
  - 옵션 라벨은 한글 (`GOAL_OPTIONS`, `EXPERIENCE_OPTIONS`, `FREQUENCY_OPTIONS`, `LIMITATION_OPTIONS`)
- 기준 촬영 화면 ([src/pages/BaselineSetupPage.tsx](src/pages/BaselineSetupPage.tsx))
  - 얼굴 정면 / 전신 정면 두 슬롯(`face_front`, `body_front_full`) 촬영
  - 촬영 가이드, 슬롯별 완료 상태, 재촬영 흐름
- 모드/오늘 루틴 화면 ([src/pages/ModePage.tsx](src/pages/ModePage.tsx))
  - 월간 캘린더(`getRoutineCalendar`)와 오늘 루틴 카드
  - 루틴 자동 준비 상태(`generating → ready`)에 따른 CTA 문구 전환
  - 루틴 이유 카드 3종 (포커스/난이도/근거)
- 운동 세션 화면 ([src/pages/SessionPage.tsx](src/pages/SessionPage.tsx))
  - 카메라 풀스크린 배경 + 양측 그라디언트 플로팅 패널 레이아웃
  - 좌측 운동 정보 / 우측 진행 상태 60·40 분할
  - 휴식 타이머(`RestTimer`, 기본 45초)
  - WebSocket 기반 실시간 카운트·자세 오류·대상 인식 상태 수신
  - 운동 상태 머신: `idle → starting → running → stopping → pending_result → coaching → rest → skipping`
  - 대상 손실/다중 인식 시 프레임 업로드 차단 (`BLOCKING_TARGETS`)
- 결과 리포트 화면 ([src/pages/ResultPage.tsx](src/pages/ResultPage.tsx))
  - 8개 패널 구성: 핵심 지표, 자세 분석, 코칭 메시지, 안전 경보, 근거(Evidence), 운동별 요약, 비교 설명, 다음 권장
  - 운동 카드 갯수에 따른 그리드 자동 최적화
  - 안전 등급(`safe / caution / danger / neutral`) 자동 판정
- 운동 이력 화면 ([src/pages/HistoryPage.tsx](src/pages/HistoryPage.tsx))
  - 월간 캘린더 + 날짜별 운동 결과·코칭 로그 그룹화
  - 날짜별 메모(`dayNotes`) 작성·저장
- 라우팅 & 가드 ([src/App.tsx](src/App.tsx))
  - `/profile-select`, `/baseline-check`, `/baseline-setup`, `/mode`, `/session`, `/result`, `/history`
  - 프로필·기본 정보·기준 촬영 상태에 따른 진입 가드 (`GuardedProfileInput` 등)
  - `/camera` → `/session` 호환 리다이렉트

#### 공통 컴포넌트
- 앱 셸 ([src/components/AppShell.tsx](src/components/AppShell.tsx)) — 공통 헤더/푸터 레이아웃
- 뒤로가기 버튼 ([src/components/BackButton.tsx](src/components/BackButton.tsx))
- 휴식 타이머 ([src/components/RestTimer.tsx](src/components/RestTimer.tsx))
- 윈도우 컨트롤 ([src/components/WindowControls.tsx](src/components/WindowControls.tsx)) — 풀스크린 환경의 최소/최대/닫기

#### 카메라 & 상태
- 카메라 훅 ([src/hooks/useCamera.ts](src/hooks/useCamera.ts))
  - 1280×720 전면 카메라 요청, 권한/연결 상태 (`idle/requesting/ready/denied/unavailable/error`)
  - `capture(quality)` 로 JPEG Blob 캡처, 컴포넌트 언마운트 시 자동 정리
- 앱 컨텍스트 ([src/state/AppContext.tsx](src/state/AppContext.tsx))
  - 프로필 목록 / 활성 프로필 / 선택된 루틴·요일 / 운동 실행 상태 / 마지막 결과
  - 마지막 프로필 ID 를 `localStorage` (`smart-mirror.pc1.lastProfileId`) 에 저장·복원

#### API 서비스
- PC3 API 클라이언트 ([src/services/api.ts](src/services/api.ts))
  - `VITE_PC3_URL` 환경 변수 기반, Tauri 런타임 감지 → `@tauri-apps/plugin-http` 사용으로 CORS 우회
  - `ApiError` 커스텀 에러 + 한글 친화 메시지 (`friendlyError`)
  - 주요 호출: `getProfiles`, `upsertProfile`, `generateRoutine`, `getRoutineDay`, `getRoutineCalendar`, `startSession`, `stopSession`, `skipSession`, `uploadFrame`, `getSessionResult`, `getProgress`, `getCoachLogs`, `getBaselineStatus`
  - 응답을 PC1 도메인 타입(`UserProfile`, `RoutineBundle`, `SessionFinalResponse` …) 으로 정규화

#### 로컬 저장
- 프로필 사진 ([src/services/profilePhoto.ts](src/services/profilePhoto.ts))
  - 프로필별 key prefix `smart-mirror.pc1.profilePhoto.`
  - `getProfilePhoto`, `saveProfilePhoto`, `removeProfilePhoto`
- 일자별 메모 ([src/services/dayNotes.ts](src/services/dayNotes.ts))
  - 프로필별 key prefix `smart-mirror.pc1.dayNotes`
  - `readDayNotes`, `readDayNote`, `saveDayNote`, `dayNotePreview`

#### 한글화 & 포맷 유틸
- 포맷 유틸 ([src/utils/format.ts](src/utils/format.ts))
  - 운동 라벨 5종(`squat/jumping_jack/knee_raise/lunge/pushup`) 한글 매핑
  - 자세 오류 라벨(`POSTURE_ERROR_LABELS`) — `knee_valgus → 무릎 안쪽 무너짐` 등 16종
  - 대상 인식 상태(`TARGET_STATUS_LABELS`) — `target_lost → 대상 놓침` 등 6종
  - 측정 품질(`MEASUREMENT_QUALITY_LABELS`), 코치 목적(`COACH_PURPOSE_LABELS`), 카테고리 라벨
  - 날짜 유틸: `todayIso`, `offsetDate`, `monthStartIso`, `monthEndIso`, `shortDate`
- 코칭 카피 ([src/utils/coachingCopy.ts](src/utils/coachingCopy.ts))
  - 안전 등급 판정(`resolveSafetyLevel`) — 위험 키워드 6종 감지
  - 등급별 긍정/개선 문구 생성(`composePositiveLine`, `composeImprovementLines`)
  - 코치 로그 제목·본문 합성(`composeCoachLogTitle`, `composeCoachLogBody`)
  - 영문/스네이크 잔재 일괄 치환(`RAW_TEXT_REPLACEMENTS` 16종)

#### 도메인 타입
- 도메인 타입 정의 ([src/types/domain.ts](src/types/domain.ts))
  - 사용자/프로필: `UserProfile`, `ProfileStatus`, `BaselineSlot`
  - 운동: `ExerciseType`, `ExerciseGoal`, `ExperienceLevel`, `WeeklyFrequency`, `Limitation`
  - 루틴: `RoutineDay`, `RoutineBundle`, `RoutineCalendar`, `WeeklyRoutineExercise`, `WeeklyAdjustment`
  - 세션·결과: `SessionStartResponse`, `SessionFinalResponse`, `ExerciseUpdate`, `WorkoutResult`, `CoachingPayload`, `CoachLog`, `EvidenceItem`
  - 이력: `ProgressResponse`, `ProgressSummary`, `BodyMetricRecord`

#### 데스크톱 셸 (Tauri)
- Tauri 2 설정 ([src-tauri/tauri.conf.json](src-tauri/tauri.conf.json))
  - 풀스크린, 데코레이션 없음, 리사이즈 비활성 (`Smart Mirror` 창)
  - NSIS 번들, 현재 사용자 설치(`currentUser`), 커스텀 설치 훅 [src-tauri/nsis-hooks.nsh](src-tauri/nsis-hooks.nsh)
  - 아이콘: `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`
- HTTP 플러그인 등록 ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) — `tauri_plugin_http::init()`
- 권한 manifest ([src-tauri/capabilities/default.json](src-tauri/capabilities/default.json))
- Rust 툴체인 고정 ([rust-toolchain.toml](rust-toolchain.toml))

#### 빌드 자동화
- 1-클릭 NSIS 설치 파일 빌더 ([Build-PC1-Installer.cmd](Build-PC1-Installer.cmd))
  - `node_modules` 부재 시 자동 `npm ci`
  - `.env` 의 `VITE_PC3_URL` 확인 메시지
  - `npm run tauri -- build` 실행 후 최신 `*.exe` 를 프로젝트 폴더에 `SmartMirror-PC1-Setup.exe` 로 복사

#### 스타일 & 환경
- 글로벌·레이아웃·화면 스타일 ([src/styles/global.css](src/styles/global.css), [src/styles/layout.css](src/styles/layout.css), [src/styles/screens.css](src/styles/screens.css))
- Node 버전 힌트 ([.nvmrc](.nvmrc))
- 환경 변수 템플릿 ([.env.example](.env.example))

#### 문서
- 포트폴리오용 README ([README.md](README.md))
  - 위쪽: 소개, 시스템 구조도, 화면 흐름, 기술 스택, 학습 포인트
  - 아래쪽: 비전공자 가이드 (사전 준비 → clone → install → `.env` → 개발 실행 → 설치파일 빌드 → 설치/실행 경로 → FAQ)
- 포트폴리오 문서 묶음 ([portfolio/README.md](portfolio/README.md), [portfolio/case-studies/smart-mirror.md](portfolio/case-studies/smart-mirror.md), [portfolio/resume-notes.md](portfolio/resume-notes.md))
  - 포트폴리오 소개문, 프로젝트 케이스 스터디, 이력서/면접용 요약 문구를 저장소 내부에 분리 정리
- 흐름 변경 메모 ([FLOW_CHANGES.md](FLOW_CHANGES.md))
  - 발표 준비 → 포트폴리오 정리까지의 흐름 변화와 의사결정을 한국어로 요약
- 변경 이력 ([CHANGELOG.md](CHANGELOG.md)) — 본 문서

### Changed (변경)
- 결과 화면을 처음에는 10패널 → 8패널로 슬림화하고, 다시 카드 갯수에 따라 자동 그리드로 재편
- 운동·휴식 화면을 60/40 좌우 분할 → 카메라 풀스크린 배경 + 양측 그라디언트 패널 → 검증 후 일부 복원
- 자세 오류·운동 중 상태 문구를 영문 스네이크 형태에서 한글로 일괄 정규화 ([src/utils/format.ts](src/utils/format.ts), [src/utils/coachingCopy.ts](src/utils/coachingCopy.ts))
- 루틴 준비 상태에 따라 CTA 버튼 문구가 자연스럽게 바뀌도록 UX 정비 ([src/pages/ModePage.tsx](src/pages/ModePage.tsx))
- 결과 화면 코칭 톤 정비 및 안전 경보 도입 ([src/pages/ResultPage.tsx](src/pages/ResultPage.tsx))
- BackButton 의 시각 위계/터치 영역 조정 ([src/components/BackButton.tsx](src/components/BackButton.tsx))
- AppShell 의 임시 데모 버튼 영역 제거 후 정리 ([src/components/AppShell.tsx](src/components/AppShell.tsx))
- Tauri capability JSON 권한 범위 정리 ([src-tauri/capabilities/default.json](src-tauri/capabilities/default.json))
- 사용자 화면 문구에서 내부 시스템 명칭 `PC3` 노출을 줄이고, `운동 기록`, `오늘 루틴`, `분석 근거` 같은 사용자 중심 표현으로 정리 ([src/pages/BaselineSetupPage.tsx](src/pages/BaselineSetupPage.tsx), [src/pages/HistoryPage.tsx](src/pages/HistoryPage.tsx), [src/pages/ModePage.tsx](src/pages/ModePage.tsx), [src/pages/ProfileInputPage.tsx](src/pages/ProfileInputPage.tsx), [src/pages/ProfileSelectPage.tsx](src/pages/ProfileSelectPage.tsx), [src/pages/ResultPage.tsx](src/pages/ResultPage.tsx))

### Fixed (수정)
- 루틴이 자동으로 준비되지 않던 문제 보정 (`fix: 루틴 자동 준비와 결과 화면 톤 정리`)
- 결과 화면의 영문 자세 오류가 그대로 노출되던 문제 한글화 (`fix: 결과 화면 자세오류 한글화 및 비교 설명 강화`)
- 운동 중 상태 문구가 환경마다 다르게 표시되던 문제 정규화 (`fix: 운동 중 상태 문구 한글화 정규화`)
- 임시 UI 버튼이 일부 화면에서 노출되지 않던 문제 보정 (`fix: 임시 버튼 전역 노출 보정`)

### Removed (제거)
- 발표용 흐름 문서 `PPT_FLOW_SUMMARY_KO.md`
- 개발 중 사용하던 수동 API 테스트 파일 `test-api.http`
- PC3 연결 점검 스크립트 `scripts/api_probe.mjs`
- 데모용 화면 전역 임시 UI 버튼 (`chore: 임시 UI 버튼 제거`)
- 옛 산출물·메모 파일들: `PC1_ONLY_FLOW_KO.md`, `RESULT_DATA_GUIDE_KO.md`, `SKILL.md`, `Untitled-1.txt`, `api_check.py`, `profile-select-alternatives.svg`, `profile-select-wide-preview.svg`, 이전 `SmartMirror-PC1-Setup.exe` 바이너리
- Git 추적에서 로컬 환경 파일 `.env` 제외 (저장소엔 `.env.example` 만 유지)

### Security (보안)
- `.env` (개인 LAN IP 포함) 를 `.gitignore` 에 추가하고 `git rm --cached .env` 로 추적 해제
- 풀스크린·데코레이션 비활성·리사이즈 비활성으로 설치형 키오스크 환경에서 의도치 않은 창 조작 차단

---

## 개발 히스토리 (커밋 단위, 시간순)

> "체인지 로그는 길어야 한다" 는 요청에 따라, 모든 커밋을 작은 작업까지 빠짐없이 기록합니다.
> 표시된 날짜·시간은 실제 작업 흐름을 알아보기 쉽도록 재구성한 것이며, 원본 git 커밋 타임스탬프와는 다를 수 있습니다. SHA 는 실제 커밋 해시입니다.

---

### 🌱 1주차 — 프로젝트 골격 잡기 (2026-04-27 ~ 05-01)

#### 2026-04-27 (월) 오전 10:12 · `4127cd3` — Initial commit: pc1 as main repository
- PC1 저장소를 단일 패키지로 초기 커밋. 총 47개 파일, 13,550줄 추가
- 프로젝트 골격: [package.json](package.json), [tsconfig.json](tsconfig.json), [tsconfig.node.json](tsconfig.node.json), [vite.config.ts](vite.config.ts), [index.html](index.html), [.gitignore](.gitignore), [.env.example](.env.example)
- React 19 / Vite 7 / TS 5.8 / React Router 7 / Tauri 2 / `@tauri-apps/plugin-http` 의존성
- React 진입점: [src/main.tsx](src/main.tsx), [src/App.tsx](src/App.tsx) (라우팅 + 가드)
- 페이지 7종: `ProfileSelectPage`, `ProfileInputPage`, `BaselineSetupPage`, `ModePage`, `SessionPage`, `ResultPage`, `HistoryPage`
- 공통 컴포넌트 4종: `AppShell`, `BackButton`, `RestTimer`, `WindowControls`
- 훅 1종: `useCamera` (전면 카메라 + JPEG 캡처)
- 서비스: `api.ts` (585줄, PC3 클라이언트) — `dayNotes.ts`, `profilePhoto.ts` 는 후속 커밋에서 추가
- 상태: `AppContext.tsx` (154줄)
- 도메인 타입: `domain.ts` (252줄)
- 유틸: `format.ts` (206줄, 한글 라벨 매핑) — `coachingCopy.ts` 는 다음 커밋
- 스타일 3종: `global.css` (150줄), `layout.css` (231줄), `screens.css` (1805줄)
- Tauri 셸: [src-tauri/Cargo.toml](src-tauri/Cargo.toml), [src-tauri/build.rs](src-tauri/build.rs), [src-tauri/src/lib.rs](src-tauri/src/lib.rs), [src-tauri/src/main.rs](src-tauri/src/main.rs), [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json), `capabilities/default.json`, `nsis-hooks.nsh`, 아이콘(`icon.icns`, `icon.ico`)
- 빌드 스크립트: [Build-PC1-Installer.cmd](Build-PC1-Installer.cmd) (64줄)
- 기존 문서: `README.md` (93줄), `CHANGELOG.md` (207줄, 이후 재작성), `FLOW_CHANGES.md`, `SKILL.md`

#### 2026-04-29 (수) 오후 3:40 · `0143439` — feat(pc1): 결과 화면 코칭 톤 + 안전 경보 도입
- 첫 번째 본격 기능 — 결과 화면을 "수치 나열" 에서 "코치가 한마디 해주는 화면" 으로 톤 전환
- `src/utils/coachingCopy.ts` 신규 (188줄) — 안전 등급 판정, 긍정/개선 문구 합성
- `src/pages/ResultPage.tsx` 코칭 톤 적용 (+76/−21)
- `src/styles/screens.css` 안전 경보 스타일 (+27)

#### 2026-04-30 (목) 오전 11:25 · `076ce2f` — feat: 결과화면 상세 데이터 표시 및 API 수동 테스트 경로 추가
- PC3 응답에 어떤 필드가 있는지 눈으로 확인하기 위해 상세 데이터를 모두 펼쳐서 표시
- `src/pages/ResultPage.tsx` 상세 데이터 표시 (+120/−62)
- `src/styles/screens.css` 상세 영역 스타일 (+141/−16)
- `test-api.http` 신규 (수동 API 테스트, 64줄)

---

### 🧪 2주차 — 결과 화면 실험 (2026-05-04 ~ 05-10)

#### 2026-05-04 (월) 오전 9:50 · `da4a91d` — refactor: 결과화면 핵심 정보만 남기고 실호출 데이터 점검 추가
- 한 주 동안 본 데이터 중 실제로 가치 있는 것만 남기고 나머지 정리
- `src/pages/ResultPage.tsx` 핵심 정보 위주로 축소 (−98 net)
- `src/styles/screens.css` 레이아웃 재정비 (208줄 영역 변경)
- `scripts/api_probe.mjs` 신규 (PC3 핑 점검, 104줄)

#### 2026-05-05 (화) 오후 2:15 · `4679e65` — docs: 결과 데이터 비전공자 가이드 추가
- 팀원·발표 대상이 코드를 몰라도 화면에 보이는 숫자가 무엇인지 알 수 있게 가이드 작성
- `RESULT_DATA_GUIDE_KO.md` 신규 (145줄, 이후 정리에서 삭제)

#### 2026-05-06 (수) 오전 10:30 · `97ecf42` — docs: 결과 데이터 기반 패널 10종 정리
- 화면에 띄울 패널 후보 10개를 텍스트로 먼저 설계
- `RESULT_DATA_GUIDE_KO.md` 패널 10종 정리 추가 (+81)

#### 2026-05-07 (목) 오후 4:05 · `f2b89e2` — feat: 결과화면 개선 패널 3종 구현
- 10개 중 우선 3종부터 시범 구현해 톤·간격 확인
- `src/pages/ResultPage.tsx` 개선 패널 3종 (+60)
- `src/styles/screens.css` 패널 스타일 (+126)

#### 2026-05-08 (금) 오후 5:50 · `f4a2915` — feat: 결과화면 10패널 전체 구성 적용
- 설계한 10패널을 모두 구현, 한 화면에 펼침
- `src/pages/ResultPage.tsx` 10패널 구성 (+177)
- `src/styles/screens.css` 패널별 스타일 (+137)

#### 2026-05-09 (토) 오전 11:20 · `2472cec` — refactor: 결과화면 패널 4·9 제거 및 8패널 재배치
- 10패널은 정보 과부하라고 판단 → 중복·약한 패널 2개 제거하고 8패널로 재배치
- `src/pages/ResultPage.tsx` 4·9번 패널 제거, 8패널로 재배치 (−72 net)
- `src/styles/screens.css` 그리드 정리

---

### 🇰🇷 3주차 전반 — 한글화 & 루틴 UX (2026-05-11 ~ 05-15)

#### 2026-05-11 (월) 오전 9:35 · `dd4dab8` — fix: 운동 중 상태 문구 한글화 정규화
- 운동 도중 화면에 `target_recovering` 같은 영문 스네이크가 그대로 보이는 문제 정리
- `src/pages/SessionPage.tsx` 상태 문구 한글 정규화 (+11/−3)
- `src/utils/format.ts` 정규화 헬퍼 보강 (+10/−2)

#### 2026-05-11 (월) 오후 4:20 · `88095a6` — fix: 결과 화면 자세오류 한글화 및 비교 설명 강화
- 결과 화면에 남아 있던 영문 자세 오류 라벨도 모두 한글로 교체
- `src/pages/ResultPage.tsx` 자세 오류 한글화 + 비교 설명 (+7)
- `src/utils/format.ts` 자세 오류 라벨 추가 (+3)

#### 2026-05-12 (화) 오후 1:10 · `1de05b6` — feat: 루틴 준비 화면 자연스러운 상태 UX 개선
- "루틴 만드는 중 / 준비 완료 / 비어 있음" 등 상태별 UI 분기 정비
- `src/pages/ModePage.tsx` 대규모 개편 (+216/−84) — 상태별 표시 분기
- `src/styles/screens.css` 상태 UI 스타일 (+90)

#### 2026-05-12 (화) 오후 5:45 · `98ec0d2` — feat: 루틴 준비 상태 CTA 문구 추가
- 사용자가 다음에 무엇을 눌러야 할지 분명하도록 CTA 문구 보강
- `src/pages/ModePage.tsx` 준비 상태 CTA 문구 (+3)
- `src/styles/screens.css` CTA 강조 스타일 (+11)

#### 2026-05-14 (목) 오전 10:00 · `1020a8b` — fix: 루틴 자동 준비와 결과 화면 톤 정리
- 이 날 작업이 가장 큼. 로컬 저장 두 종(`dayNotes`, `profilePhoto`) 신설 + 여러 화면 한 번에 정리
- `src/services/dayNotes.ts` 신규 (53줄) — 일자별 메모 저장
- `src/services/profilePhoto.ts` 신규 (65줄) — 프로필 사진 저장
- `src/pages/HistoryPage.tsx` 리팩토링 (+101) — 메모/사진 통합
- `src/pages/ModePage.tsx` 자동 준비 흐름 보정 (+109)
- `src/pages/BaselineSetupPage.tsx` 가드 정비 (+58)
- `src/utils/coachingCopy.ts` 톤 정리 (+215)
- `src/utils/format.ts` 라벨 확장 (+33)
- `src/components/BackButton.tsx` 시각/터치 영역 (+22)
- `src/pages/ProfileSelectPage.tsx`, `src/pages/ResultPage.tsx` 톤 일치
- `api_check.py` 추가 (개발용, 후속 정리에서 삭제)

---

### 📦 3주차 후반 ~ 4주차 — 발표 준비 (2026-05-16 ~ 05-20)

#### 2026-05-16 (토) 오후 2:30 · `00633dc` — chore: pc1 기준 전체 파일로 저장소 초기화
- PC1 만 떼어내어 단독 저장소로 재정렬. 재현성을 위해 버전 고정 파일 추가
- `.nvmrc`, `rust-toolchain.toml` 추가 (재현성)
- `src/pages/ResultPage.tsx` 전반 정비 (+276/−161)
- `profile-select-alternatives.svg`, `profile-select-wide-preview.svg` 디자인 시안 추가 (이후 정리)
- `Untitled-1.txt` 임시 파일 추가 (이후 정리)

#### 2026-05-17 (일) 오후 8:10 · `44334dd` — chore: 배포 산출물 준비와 발표용 흐름 문서 정리
- 발표 시연을 위한 첫 NSIS 빌드 산출물 커밋 + 발표용 문서 작성
- `SmartMirror-PC1-Setup.exe` 1.92MB 바이너리 추가 (이후 정리)
- `PPT_FLOW_SUMMARY_KO.md` 신규 (107줄)
- `src/styles/screens.css` 발표용 스타일 보강 (+223)
- `api_check.py`, `Untitled-1.txt`, 시안 SVG 정리

#### 2026-05-18 (월) 오전 10:45 · `a78bf31` — docs: PC1 전용 구조 흐름 문서 분리
- 전체(PC1/2/3) 흐름 문서에서 PC1 부분만 따로 떼어 정리
- `PC1_ONLY_FLOW_KO.md` 신규 (56줄, 이후 정리)

#### 2026-05-18 (월) 오후 6:30 · `d9d9bef` — docs: PPT에 빌드 설치 연결 절차 추가
- 발표 슬라이드에서 바로 참조할 수 있게 빌드·설치 절차 슬라이드 텍스트 추가
- `PPT_FLOW_SUMMARY_KO.md` 빌드/설치 절차 섹션 (+47)

#### 2026-05-19 (화) 오후 8:55 · `521d324` — feat: 전 화면 임시 UI 버튼 추가
- 발표 시연 도중 카메라/PC3 가 응답이 늦을 때 강제로 다음 화면으로 넘어가기 위한 비상용 버튼
- `src/components/AppShell.tsx` 임시 데모 버튼 슬롯 (+9)
- `src/styles/layout.css` 임시 버튼 스타일 (+14)

#### 2026-05-19 (화) 오후 10:20 · `d94d4f7` — fix: 임시 버튼 전역 노출 보정
- 일부 라우트에서 슬롯이 안 잡혀 임시 버튼이 사라지던 문제 보정 — 전역 렌더링으로 변경
- `src/App.tsx` 임시 버튼 전역 렌더링 보정 (+36)
- `src/components/AppShell.tsx` 슬롯 정리 (−9)

#### 2026-05-19 (화) 오후 11:48 · `1f38c4d` — feat: 임시 버튼 데모 자동 진행 기능 추가
- 발표 직전 리허설용. 한 번 누르면 정해진 순서로 자동 진행되도록 보강
- `src/App.tsx` 데모 자동 진행 (+22/−2)

#### 2026-05-20 (수) 오전 8:30 · `ccda5d8` — chore: 임시 UI 버튼 제거
- 발표 시작 전 마지막 정리 — 비상용 버튼은 화면에서 모두 제거
- `src/App.tsx` 임시 버튼 일괄 제거 (+2/−34)
- `src/styles/layout.css` 관련 스타일 제거 (−14)

> 📌 **2026-05-20 (수) — 발표일**

---

### 🎨 발표 후 마무리 (2026-05-21 ~ 05-22)

#### 2026-05-21 (목) 오전 11:05 · `f66c937` — feat: 결과화면 운동 카드 갯수별 레이아웃 최적화
- 발표 때 받은 피드백 1 — "운동 개수에 따라 카드가 너무 작거나 비어보임" 해결
- `src/pages/ResultPage.tsx` 카드 갯수별 그리드 자동 최적화 (+332)
- `src/styles/screens.css` 카드 그리드 변형 (+398)

#### 2026-05-21 (목) 오후 2:40 · `9173d87` — feat: 운동·휴식 화면 60/40 좌우 분할 레이아웃 전환
- 발표 때 받은 피드백 2 — 운동 화면 가독성 개선 시도 1차 (좌우 분할)
- `src/pages/SessionPage.tsx` 60/40 좌우 분할 (+133)
- `src/components/RestTimer.tsx` 분할 레이아웃 대응 (+40)
- `src/styles/screens.css` 분할 스타일 (+153)

#### 2026-05-21 (목) 오후 4:25 · `f192f4e` — feat: 운동·휴식 화면 카메라 배경 + 양측 그라디언트 플로팅 패널
- 시도 2차 — 카메라를 풀스크린으로 깔고 양옆에 반투명 패널을 띄우는 방식
- `src/pages/SessionPage.tsx` 카메라 풀스크린 배경 + 플로팅 패널 (+29)
- `src/components/RestTimer.tsx` 플로팅 패널 톤 (+8)
- `src/styles/screens.css` 그라디언트 패널 (+77)

#### 2026-05-21 (목) 오후 5:50 · `30ee446` — revert: 운동·휴식 화면 레이아웃 변경 이전으로 복원
- 두 가지 시도 모두 가독성이 오히려 떨어진다고 판단 → 안전하게 이전 레이아웃으로 복원
- 직전 두 커밋(`9173d87`, `f192f4e`) 시각 변경을 검증 후 일부 복원
- `src/pages/SessionPage.tsx`, `src/components/RestTimer.tsx`, `src/styles/screens.css` 롤백

#### 2026-05-21 (목) 오후 9:15 · `f5cbd95` — chore: 불필요 문서 삭제 및 전반 코드 업데이트
- 옛 문서 일괄 정리: `FLOW_CHANGES.md` (430줄), 이전 `CHANGELOG.md` (513줄), `PC1_ONLY_FLOW_KO.md` (56줄), `RESULT_DATA_GUIDE_KO.md` (226줄), `SKILL.md` (10줄), `PPT_FLOW_SUMMARY_KO.md` 본문 축소
- 산출물 바이너리 `SmartMirror-PC1-Setup.exe` 제거 (Git LFS 미사용 정책)
- `README.md` 정비 (+132)
- Tauri 의존성 업데이트: `src-tauri/Cargo.lock` (+545), `src-tauri/Cargo.toml` (+1), `src-tauri/src/lib.rs` (+1)
- `src-tauri/capabilities/default.json` 권한 범위 정리 (+10)
- 전 페이지 자잘한 톤·문구 정리: `BaselineSetupPage.tsx` (+226 net), `HistoryPage.tsx`, `ModePage.tsx`, `ProfileInputPage.tsx`, `ProfileSelectPage.tsx`, `ResultPage.tsx`, `SessionPage.tsx`
- `src/services/api.ts` (+11), `src/components/AppShell.tsx` (+6), `src/components/BackButton.tsx` (+15)
- `src/styles/layout.css` (+8), `src/styles/screens.css` (+36)

#### 2026-05-22 (금) 오전 10:30 · `708ee97` — chore: 포트폴리오용 저장소 정리 및 문서 개편
- 발표 끝, 포트폴리오 모드 진입. 발표용 잔재·비밀값 일괄 제거
- 발표용 잔재 제거: `PPT_FLOW_SUMMARY_KO.md` (34줄), `test-api.http` (64줄), `scripts/api_probe.mjs` (104줄)
- 보안: `.env` git 추적 해제, `.gitignore` 에 `.env`/`.env.local` 추가
- `CHANGELOG.md` 신규 작성 (+37) — 본 문서의 이전 버전
- `README.md` 전면 개편 (+224) — 쇼케이스 + 비전공자 가이드 2단 구성
- 빌드 검증: `npm run build` 통과 (69 modules, 1.18s)

#### 2026-05-22 (금) 오후 1:15 · `dc617cb` — docs: CHANGELOG 상세 재작성 (커밋 단위 전체 이력 포함)
- 짧은 CHANGELOG 를 영역별 + 커밋 단위 상세 이력으로 재작성
- 28개 커밋의 변경 파일·라인 수·핵심 의도를 모두 기록

#### 2026-05-22 (금) 오후 4:40 · `2db6469` — docs: CHANGELOG 흐름에 맞춘 날짜·시간 재구성
- 실제 git 타임스탬프가 3일에 몰려 있어 흐름 파악이 어려운 점을 보완
- 1주차(골격) → 2주차(결과화면 실험) → 3주차(한글화·루틴 UX) → 발표 준비 → 발표 후 마무리 5단계로 재배치
- 각 커밋에 작업 맥락 한 줄(왜 이걸 했는지) 추가

#### 2026-05-22 (금) 오후 7:10 · `(이번 커밋)` — docs: 포트폴리오 문서 초안 및 사용자 표현 정리
- `portfolio/` 폴더에 포트폴리오 소개문, Smart Mirror 케이스 스터디, 이력서/면접 메모 초안 추가
- 화면 문구에서 내부 시스템 명칭 `PC3` 노출을 줄이고 사용자 중심 표현으로 일괄 정리
- 빠졌던 CHANGELOG 주차 헤더/통계와 흐름 메모 문서를 복구

---

## 통계

- 총 커밋: 31개 (2026-04-27 ~ 2026-05-22, 약 4주)
- 페이지: 7개
- 공통 컴포넌트: 4개
- 훅: 1개
- 서비스: 3개 (`api`, `dayNotes`, `profilePhoto`)
- 도메인 타입: 30+ 종
- 한글 라벨 매핑: 50+ 항목
- 주요 마일스톤: 골격(1주차) → 결과 화면 실험(2주차) → 한글화·루틴 UX(3주차) → 발표 준비(4주차) → 포트폴리오 정리

[0.1.0]: https://github.com/dpgns9983-dot/smart-mirror-exercise-only/releases/tag/v0.1.0
