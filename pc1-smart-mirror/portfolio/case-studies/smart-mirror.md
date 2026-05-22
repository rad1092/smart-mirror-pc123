# Smart Mirror Exercise Coaching UI

## Overview

Smart Mirror is a desktop UI for an exercise coaching experience in front of a mirror. A user selects a profile, completes baseline capture, checks an AI-recommended routine, performs camera-based exercises, and reviews coaching results after the session.

My role was to own the PC1 user interface. PC1 is the screen, camera, and desktop app layer. It connects to the analysis and coaching APIs, then turns those responses into a flow that can be understood and demonstrated by a user.

## My Role

- Built the Tauri + React desktop UI for the Smart Mirror PC1 app.
- Implemented the main flow: profile selection, profile input, baseline capture, routine calendar, exercise session, result report, and history.
- Integrated profile, baseline, routine, session, analysis, and result APIs through the existing PC3 contract.
- Connected camera capture, frame upload, WebSocket updates, session stop, session skip, and result retrieval into UI state.
- Normalized AI/backend responses into readable Korean UI labels and coaching copy.
- Stabilized the app for demo use with fullscreen Tauri settings, internal window controls, and build/install documentation.

## Architecture

```text
User
  |
  v
PC1 Smart Mirror UI
  - Tauri desktop shell
  - React screen flow
  - camera capture
  - routine/session/result UI
  |
  v
Vision Gateway / AI API
  - profile and baseline API
  - routine and session API
  - exercise analysis result
  |
  v
Coaching / RAG System
  - coaching message
  - evidence
  - recommendation context
```

PC1 focuses on the user-facing product experience. Analysis, recommendation, and coaching are handled behind API boundaries. This allowed UI work to improve independently while preserving backend contracts.

## Key Screens

- **Profile Select**: choose an existing user, create a new profile, keep the recently used profile visible.
- **Profile Input**: collect height, weight, goal, experience level, weekly frequency, and limitations.
- **Baseline Setup**: guide face-front and body-front capture, then enable capture only when framing is acceptable.
- **Routine**: show a monthly routine calendar, today's routine, recommendation reasons, exercise list, and start action.
- **Session**: camera-centered exercise screen with reps, stability, feedback, posture alerts, skip, and rest flow.
- **Result**: routine summary, exercise-level results, stability, posture errors, coaching message, and analysis evidence.
- **History**: date-based workout records and recent progress summary.

## Technical Challenges

### 1. Turning backend responses into product language

The analysis and coaching responses can include technical status codes, measurement quality values, posture error labels, evidence, and nested session data. Showing those values directly would make the result screen hard to understand.

I added a UI-side normalization layer so the app can present readable labels, grouped result cards, and coaching-oriented copy without changing the backend contract.

### 2. Building a camera-centered exercise flow

The exercise screen needed to keep the camera feed central while still showing enough state for the user to continue. I connected session start, frame upload, WebSocket updates, automatic finish, skip, rest timer, and result navigation into one UI flow.

### 3. Making the app feel like a smart mirror

The target environment was not a normal browser tab. The app needed to run as a fullscreen Windows desktop experience with no OS title bar. I used Tauri settings and internal window controls to support the smart mirror presentation.

### 4. Improving UI without changing API contracts

PC1 had to adapt to the existing API shape instead of changing PC3/PC2 behavior. The UI layer handled response normalization, fallback labels, and screen copy while preserving endpoint paths, request payloads, and response contracts.

## What I Improved

- Reduced user-facing internal system names and replaced them with product-facing labels such as "AI recommended routine", "today's routine", and "analysis evidence".
- Converted raw analysis codes and posture labels into readable Korean UI text.
- Combined calendar, today's routine, recommendation reason, and exercise list into one routine screen.
- Added a camera-based session flow that shows reps, stability, feedback, posture alerts, and skip behavior.
- Reworked the result screen into summary, exercise-level report, coaching message, and detailed analysis sections.
- Defined a QA split between PC1 rendering/build issues and external server connectivity issues.

## Result / Demo Readiness

- React + TypeScript production build passes.
- Tauri Windows fullscreen desktop app configuration is in place.
- Main flow exists from profile selection to result and history.
- PC1 can be checked separately from PC2/PC3 server health.
- Build and installer steps are documented for non-developer demo setup.

## Next Improvements

- Add real screenshots and a short demo GIF.
- Add clearer visual graphs for stability and posture trends.
- Add long-term progress charts in the history/result area.
- Convert this Markdown portfolio into a GitHub Pages site.
- Add more projects after the Smart Mirror case study is polished.
