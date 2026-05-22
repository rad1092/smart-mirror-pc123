# PC1 Smart Mirror UI

> 거울 앞에 서서 프로필을 고르면, 카메라가 자세를 보고 코치가 한마디 해주는 **스마트 미러 화면 앱**입니다.

PC1 은 사용자가 만나는 화면 부분만 담당하고, 운동 분석과 코칭 문장은 옆에 있는 PC3 와 PC2 가 만들어 보내줍니다. 이 저장소는 그 중 **PC1 화면 앱** 의 전체 코드를 담고 있습니다.

> 발표가 끝난 뒤 포트폴리오용으로 정리한 버전입니다. 비전공자도 이 README 만 보고 따라 설치할 수 있도록 작성했습니다.

---

## 1. 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 무엇 | 거울처럼 생긴 화면에서 운동을 안내·기록하는 데스크톱 앱 |
| 누가 쓰나 | 집에서 혼자 운동하는 사람 (특히 자세를 봐줄 사람이 없는 환경) |
| 어디서 도는가 | Windows PC 한 대 + 웹캠. 풀스크린으로 띄워 거울 모니터에 붙입니다 |
| 무엇으로 만들었나 | Tauri 2 (Rust), React 19, TypeScript, Vite |
| 화면 흐름 | 프로필 선택 → 기본 정보 입력 → 기준 촬영 → 모드 선택 → 운동 → 결과 리포트 |

---

## 2. 시스템 구조

이 앱은 혼자 모든 일을 하지 않고, **역할이 나뉜 세 대의 PC** 가 협력합니다.

```text
   [사용자]
      │
      ▼
┌───────────────┐   카메라 프레임 / 명령    ┌───────────────┐    분석 요청     ┌───────────────┐
│   PC1 (이 앱) │ ───────────────────────▶ │   PC3 게이트웨이 │ ───────────────▶ │ PC2 RAG 코칭  │
│  화면 / 카메라 │ ◀─────────────────────── │  프로필·세션·자세 │ ◀─────────────── │  근거 + 메시지 │
└───────────────┘   결과 / 코칭 메시지       └───────────────┘                  └───────────────┘
```

- **PC1 (이 저장소)**: 화면, 카메라 캡처, 사용자 흐름. 직접 분석은 하지 않음
- **PC3**: 프로필·루틴·세션 관리, 자세 분석 API 의 중계 게이트웨이
- **PC2**: RAG (Retrieval-Augmented Generation) 기반 코칭 문장과 근거 생성

PC1 은 오직 PC3 만 호출합니다. PC2 는 PC3 뒤에서 연결됩니다.

---

## 3. 화면 흐름

1. **프로필 선택** — 미러를 쓰는 사람을 고릅니다 (없으면 새로 만듭니다)
2. **기본 정보 입력** — 키·몸무게·목표·운동 빈도 등
3. **기준 촬영** — 얼굴 정면 / 전신 정면 사진을 한 번 찍어 기준값으로 저장
4. **모드 선택** — 오늘 루틴을 확인하고 운동 시작
5. **운동 세션** — 카메라가 자세를 보고, 화면에는 횟수·상태·휴식 타이머가 표시
6. **결과 리포트** — 완료 동작, 반복 수, 안정도, 자세 주의, 코칭 메시지 한 화면 요약

화면 캡처는 `docs/screenshots/` 폴더에 추가될 예정입니다 _(자리만 잡아둠)_.

---

## 4. 기술 스택과 포인트

| 영역 | 사용 기술 | 한 줄 설명 |
| --- | --- | --- |
| 데스크톱 셸 | **Tauri 2 (Rust)** | Electron 대비 가볍고 NSIS 설치 파일을 바로 만듦 |
| UI | **React 19 + React Router 7** | 화면 흐름을 라우터로 명확히 분리 |
| 빌드 도구 | **Vite 7 + TypeScript 5.8** | 빠른 개발 서버 + 타입 안정성 |
| 네트워크 | **@tauri-apps/plugin-http** | 브라우저 CORS 우회, 데스크톱에서 PC3 직접 호출 |
| 상태 | **React Context (`AppContext`)** | 외부 상태 라이브러리 없이 단일 컨텍스트로 정리 |
| 로컬 저장 | `localStorage` + 프로필별 사진/일자별 메모 | 오프라인에서도 최근 정보 유지 |

**포트폴리오 관점에서 보여주고 싶은 것**

- 역할이 분리된 분산 시스템의 **프론트엔드 끝단** 을 책임지는 경험
- 영문/원시 데이터가 그대로 노출되지 않도록 한 **현지화·정규화 레이어** (`utils/format.ts`, `utils/coachingCopy.ts`)
- 카메라·세션 상태 머신 (`idle → starting → running → stopping → pending_result`) 설계
- 비개발자가 더블클릭 한 번으로 설치 파일을 만들 수 있게 한 **빌드 자동화 스크립트**

---

## 5. 빌드와 설치 — 비전공자 가이드

> "코드는 잘 모르지만 일단 내 컴퓨터에서 돌려보고 싶어요" 를 위한 단계입니다. 순서대로 따라하시면 됩니다.

### 5-1. 사전 준비 (한 번만)

| 필요한 것 | 다운로드 위치 | 비고 |
| --- | --- | --- |
| **Node.js 20 이상** | https://nodejs.org/ko (LTS 권장) | "Windows Installer (.msi)" 선택 |
| **Rust (Stable)** | https://www.rust-lang.org/ko/tools/install | 화면에 나오는 `rustup-init.exe` 를 그대로 실행 |
| **Visual Studio Build Tools (C++)** | https://visualstudio.microsoft.com/ko/visual-cpp-build-tools/ | Rust 가 자동으로 안내해 줍니다 |
| **WebView2 Runtime** | 보통 Windows 10/11 에는 이미 설치되어 있음 | 없으면 Tauri 가 안내함 |

설치가 끝나면 PowerShell 을 열고 다음 두 줄로 확인하세요. 버전이 보이면 성공입니다.

```powershell
node --version
rustc --version
```

### 5-2. 소스 받기

```powershell
git clone <이 저장소 주소>
cd Project
```

### 5-3. 의존성 설치 (한 번만)

```powershell
npm install
```

### 5-4. PC3 주소 설정

저장소에는 `.env.example` 만 있습니다. 이 파일을 복사해서 `.env` 를 만들고, PC3 의 실제 주소로 바꿔주세요.

```powershell
Copy-Item .env.example .env
notepad .env
```

```env
VITE_PC3_URL=http://192.168.0.10:9000
VITE_DEVICE_ID=mirror_001
```

> `.env` 는 일부러 Git 에 올리지 않습니다 (개인 네트워크 주소가 외부에 노출되지 않도록).

### 5-5. 개발 모드로 실행해 보기 (선택)

코드를 수정하면서 바로 보고 싶을 때 사용합니다.

```powershell
npm run tauri -- dev
```

전체 화면 창이 뜨면 성공입니다. 종료는 창을 닫거나 PowerShell 에서 `Ctrl + C`.

### 5-6. 설치 파일 만들기 (가장 쉬운 방법)

저장소 폴더의 **`Build-PC1-Installer.cmd`** 파일을 **더블클릭** 하세요.

빌드가 끝나면 같은 폴더에 아래 파일이 생깁니다.

```text
SmartMirror-PC1-Setup.exe
```

> 처음 빌드는 Rust 가 의존성을 컴파일하느라 시간이 좀 걸립니다. 이후 빌드는 훨씬 빠릅니다.

### 5-7. 설치하고 실행하기

`SmartMirror-PC1-Setup.exe` 를 더블클릭해서 설치합니다. 설치가 끝나면 다음 두 가지 중 하나로 실행할 수 있습니다.

- **시작 메뉴** 에서 `Smart Mirror` 검색
- PowerShell:
  ```powershell
  Start-Process "$env:LOCALAPPDATA\Smart Mirror\pc1-smart-mirror.exe"
  ```

설치된 실행 파일의 실제 경로:

```text
C:\Users\<사용자>\AppData\Local\Smart Mirror\pc1-smart-mirror.exe
```

### 5-8. 설치 파일을 다른 곳에 보관하고 싶을 때

빌드가 끝나면 만들어진 `SmartMirror-PC1-Setup.exe` 를 그냥 USB·바탕화면·공유 폴더로 복사하면 됩니다.

```powershell
Copy-Item .\SmartMirror-PC1-Setup.exe "$env:USERPROFILE\Desktop\SmartMirror-PC1-Setup.exe" -Force
```

원본 NSIS 빌드 결과 위치 (참고용):

```text
src-tauri\target\release\bundle\nsis\
```

---

## 6. 자주 묻는 문제 (FAQ)

**Q. `Build-PC1-Installer.cmd` 를 실행했더니 "node_modules not found" 라고 나와요.**
A. 처음 실행이면 스크립트가 자동으로 `npm ci` 를 돌립니다. 그래도 실패하면 위 5-3 단계를 먼저 진행해 주세요.

**Q. 빌드 중 Rust 관련 오류가 떠요.**
A. 위 5-1 의 Rust + Visual Studio Build Tools 가 설치돼 있는지 확인하세요. 설치 후에는 PowerShell 을 **새로 열어야** PATH 가 반영됩니다.

**Q. 앱은 떴는데 화면이 비어 있어요 / 프로필이 안 보여요.**
A. `.env` 의 `VITE_PC3_URL` 이 실제 PC3 서버 주소를 가리키고 있는지, 그리고 PC3 서버가 켜져 있는지 확인하세요.

**Q. 전체화면이 부담스러워요.**
A. 개발 모드 (`npm run tauri -- dev`) 에서는 창 모드로 띄울 수 있도록 `src-tauri/tauri.conf.json` 의 `fullscreen` 값을 잠시 `false` 로 바꿔주세요.

---

## 7. 폴더 구조

```text
src/                React 화면 코드
  pages/            화면 단위 컴포넌트 (프로필, 세션, 결과 ...)
  components/       공통 UI (BackButton, RestTimer ...)
  hooks/            React Hook (useCamera ...)
  services/         외부 API / 로컬 저장 어댑터
  state/            AppContext (전역 상태)
  utils/            한글화·포맷 유틸
  types/            도메인 타입 정의
src-tauri/          Tauri 데스크톱 셸 (Rust)
  src/              main.rs / lib.rs
  tauri.conf.json   창·번들 설정
public/             정적 자산 (현재 비어 있음)
Build-PC1-Installer.cmd   설치 파일 1-클릭 빌드 스크립트
```

---

## 8. 라이선스 / 사용

이 저장소는 학습 및 포트폴리오 목적입니다. 실제 서비스나 의료적 판단에 사용하지 마세요.

변경 기록은 [CHANGELOG.md](CHANGELOG.md) 에서 확인하실 수 있습니다.
