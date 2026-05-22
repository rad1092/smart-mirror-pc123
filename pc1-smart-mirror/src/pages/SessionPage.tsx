import { useEffect, useMemo, useRef, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import BackButton from "../components/BackButton";
import RestTimer from "../components/RestTimer";
import { skipSession, startSession, stopSession, uploadFrame } from "../services/api";
import { useCamera } from "../hooks/useCamera";
import { useAppState } from "../state/AppContext";
import type { ExerciseUpdate, SessionFinalResponse } from "../types/domain";
import { EXERCISE_LABELS, formatExerciseTarget, formatPostureError, formatTargetStatus, friendlyError } from "../utils/format";

type Phase = "idle" | "starting" | "running" | "stopping" | "pending_result" | "coaching" | "rest" | "skipping";

const REST_SECONDS = 45;
const BLOCKING_TARGETS = new Set(["target_recovering", "target_lost", "multi_person_detected"]);

function normalizeTargetStatus(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "tracking";
  }
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readExerciseUpdate(raw: unknown): ExerciseUpdate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as ExerciseUpdate;
  if (record.exercise && typeof record.exercise === "object") {
    return {
      ...record,
      count: record.exercise.count,
      state: record.exercise.state,
      stability_score: record.exercise.stability_score,
      posture_errors: record.exercise.posture_errors,
      target_status: record.exercise.target_status,
      count_left: record.exercise.count_left,
      count_right: record.exercise.count_right,
    };
  }
  return record;
}

function coachingText(result: SessionFinalResponse | null): string {
  return result?.coaching?.mirror_message ?? result?.coaching?.summary ?? "코칭 결과를 불러왔습니다.";
}

export default function SessionPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const camera = useCamera();
  const run = app.workoutRun;
  const profile = app.activeProfile;
  const currentExercise = run?.day.exercises[run.currentIndex] ?? null;
  const nextExercise = run?.day.exercises[(run.currentIndex ?? 0) + 1] ?? null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(0);
  const [countLeft, setCountLeft] = useState<number | null>(null);
  const [countRight, setCountRight] = useState<number | null>(null);
  const [stability, setStability] = useState<number | null>(null);
  const [targetStatus, setTargetStatus] = useState("idle");
  const [feedback, setFeedback] = useState("시작 버튼을 눌러 운동을 시작하세요.");
  const [postureErrors, setPostureErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [coachingResult, setCoachingResult] = useState<SessionFinalResponse | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const frameInFlightRef = useRef(false);
  const pendingSkippedRef = useRef(false);
  const expectedCloseRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");

  const targetCount = currentExercise?.reps ?? null;
  const progress = targetCount ? Math.min(100, Math.round((count / targetCount) * 100)) : 0;
  const isLastExercise = !run || run.currentIndex >= run.day.exercises.length - 1;
  const displayLines = coachingResult?.coaching?.pc2_payload?.display_lines ?? [];

  const exerciseTitle = currentExercise ? EXERCISE_LABELS[currentExercise.exercise] : "운동";
  const exerciseDetail = currentExercise
    ? `${currentExercise.sets ?? 1}세트 · ${formatExerciseTarget(currentExercise.reps, currentExercise.durationSec)}`
    : "";

  const stopLoop = (expectedClose = false) => {
    if (expectedClose) {
      expectedCloseRef.current = true;
    }
    if (frameTimerRef.current !== null) {
      window.clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
  };

  useEffect(() => {
    void camera.start();
    return () => {
      stopLoop();
      camera.stop();
    };
  }, [camera.start, camera.stop]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== "rest") {
      void camera.start();
    }
  }, [camera.start, phase]);

  useEffect(() => {
    if (!run || !profile || !currentExercise) {
      navigate("/mode", { replace: true });
    }
  }, [app, currentExercise, navigate, profile, run]);

  const applyUpdate = (update: ExerciseUpdate | null) => {
    if (!update) {
      return;
    }
    setCount(Number(update.count ?? 0));
    setCountLeft(typeof update.count_left === "number" ? update.count_left : null);
    setCountRight(typeof update.count_right === "number" ? update.count_right : null);
    setStability(typeof update.stability_score === "number" ? update.stability_score : null);
    setTargetStatus(normalizeTargetStatus(update.target_status));
    setFeedback(update.feedback || "실시간으로 자세를 분석하고 있습니다.");
    setPostureErrors(Array.isArray(update.posture_errors) ? update.posture_errors : []);
  };

  const captureAndUpload = async () => {
    if (!sessionIdRef.current || frameInFlightRef.current) {
      return;
    }
    frameInFlightRef.current = true;
    try {
      const blob = await camera.capture(0.78);
      if (!blob) {
        return;
      }
      const response = await uploadFrame(sessionIdRef.current, blob);
      applyUpdate(readExerciseUpdate(response));
    } catch {
      setFeedback("프레임 전송이 잠시 실패했습니다. 다음 프레임에서 다시 시도합니다.");
    } finally {
      frameInFlightRef.current = false;
    }
  };

  const begin = async () => {
    if (!profile || !run || !currentExercise || camera.status !== "ready" || phase !== "idle") {
      return;
    }
    setPhase("starting");
    setError(null);
    setFeedback("세션을 준비하고 있습니다.");
    setCount(0);
    setCountLeft(null);
    setCountRight(null);
    setStability(null);
    setPostureErrors([]);
    setCoachingResult(null);
    expectedCloseRef.current = false;
    try {
      const session = await startSession(profile.id, currentExercise.exercise, run.routine.routineId, run.day.routineDayId);
      sessionIdRef.current = session.session_id;
      const ws = new WebSocket(session.ws_url);
      wsRef.current = ws;
      ws.onopen = () => setPhase("running");
      ws.onerror = () => setError("실시간 운동 채널 연결 중 오류가 발생했습니다.");
      ws.onmessage = (event) => {
        try {
          applyUpdate(readExerciseUpdate(JSON.parse(event.data)));
        } catch {
          return;
        }
      };
      ws.onclose = () => {
        if (expectedCloseRef.current) {
          expectedCloseRef.current = false;
          return;
        }
        if (sessionIdRef.current && phaseRef.current === "running") {
          setError("운동 세션 연결이 끊어졌습니다. 결과 받기를 다시 시도해주세요.");
          setPhase("pending_result");
        }
      };
      const cadence = currentExercise.exercise === "knee_raise" || currentExercise.exercise === "jumping_jack" ? 200 : 300;
      frameTimerRef.current = window.setInterval(() => void captureAndUpload(), cadence);
    } catch (caught) {
      sessionIdRef.current = null;
      setPhase("idle");
      setError(friendlyError(caught, "운동 세션을 시작하지 못했습니다. 다시 시도해주세요."));
    }
  };

  const finish = async (skipped: boolean) => {
    if (phase === "starting" || phase === "stopping" || phase === "skipping") {
      return;
    }
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setError(skipped ? "세션 시작 후에만 건너뛰기를 기록할 수 있습니다." : "시작된 세션이 없습니다.");
      return;
    }
    pendingSkippedRef.current = skipped;
    setPhase(skipped ? "skipping" : "stopping");
    setError(null);
    setFeedback(skipped ? "건너뛰기를 기록하고 있습니다." : "결과를 정리하고 있습니다.");
    stopLoop(true);
    try {
      const result = skipped ? await skipSession(sessionId, "user_skipped") : await stopSession(sessionId);
      sessionIdRef.current = null;
      setCoachingResult(result);
      const nextResults = [...(run?.results ?? []), result];
      if (!run) {
        app.setLastResult(result);
        navigate("/result", { replace: true });
        return;
      }
      if (isLastExercise) {
        const finalResult = result;
        app.setWorkoutRun({ ...run, results: nextResults });
        app.setLastResult(finalResult);
        navigate("/result", { replace: true });
        return;
      }
      app.setWorkoutRun({ ...run, results: nextResults });
      setPhase(skipped ? "rest" : "coaching");
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught, skipped ? "건너뛰기를 기록하지 못했습니다. 다시 시도해주세요." : "결과를 받지 못했습니다. 다시 시도해주세요."));
      setFeedback("현재 화면에서 결과 받기를 다시 시도할 수 있습니다.");
      setPhase("pending_result");
    }
  };

  const continueAfterCoaching = () => {
    setPhase("rest");
  };

  const advanceExercise = () => {
    if (!run) {
      navigate("/mode", { replace: true });
      return;
    }
    app.setWorkoutRun({ ...run, currentIndex: run.currentIndex + 1 });
    setPhase("idle");
    setCount(0);
    setTargetStatus("idle");
    setFeedback("다음 운동을 시작할 준비가 되었습니다.");
    setCoachingResult(null);
  };

  useEffect(() => {
    if (phase !== "running" || !targetCount || count < targetCount) {
      return;
    }
    void finish(false);
  }, [count, phase, targetCount]);

  const targetFrozen = useMemo(() => BLOCKING_TARGETS.has(targetStatus), [targetStatus]);

  if (phase === "rest" && nextExercise) {
    return (
      <RestTimer
        seconds={REST_SECONDS}
        completedExercise={exerciseTitle}
        nextExercise={EXERCISE_LABELS[nextExercise.exercise]}
        nextDetail={`${nextExercise.sets ?? 1}세트 · ${formatExerciseTarget(nextExercise.reps, nextExercise.durationSec)}`}
        onDone={advanceExercise}
        videoRef={camera.videoRef}
        onVideoReady={camera.start}
      />
    );
  }

  return (
    <main className="session-page">
      <BackButton
        fallbackTo="/mode"
        onBeforeBack={() => {
          stopLoop(true);
          camera.stop();
        }}
      />
      <video ref={camera.videoRef} className="session-video" autoPlay muted playsInline />
      {camera.status !== "ready" ? (
        <div className="camera-placeholder">
          <p>{camera.error ?? "카메라를 준비하고 있습니다."}</p>
          <button type="button" className="button button--primary" onClick={() => void camera.start()}>
            카메라 연결
          </button>
        </div>
      ) : null}

      <section className="session-hud session-hud--top">
        <div>
          <span>운동 {(run?.currentIndex ?? 0) + 1} / {run?.day.exercises.length ?? 1}</span>
          <strong>{exerciseTitle}</strong>
          <em>{exerciseDetail}</em>
        </div>
        <div className={`target-badge ${targetFrozen ? "is-warning" : ""}`}>{formatTargetStatus(targetStatus)}</div>
      </section>

      <section className="count-orb">
        <span>{progress}%</span>
        <strong>{count}</strong>
        {countLeft !== null || countRight !== null ? <em>좌 {countLeft ?? "-"} / 우 {countRight ?? "-"}</em> : null}
      </section>

      {error ? <aside className="session-alert" role="alert">{error}</aside> : null}
      <p className="session-feedback">{feedback}</p>

      <aside className="session-stats">
        <span>안정도</span>
        <strong>{stability === null ? "-" : `${Math.round(stability * 100)}%`}</strong>
        {postureErrors.slice(0, 2).map((item) => <em key={item}>{formatPostureError(item)}</em>)}
      </aside>

      {phase === "coaching" ? (
        <div className="overlay-panel">
          <section className="panel">
            <span className="eyebrow">COACHING</span>
            <h2>{exerciseTitle} 완료</h2>
            <p>{coachingText(coachingResult)}</p>
            {displayLines.length ? (
              <ul>
                {displayLines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
              </ul>
            ) : null}
            <button type="button" className="button button--primary" onClick={continueAfterCoaching}>
              다음 구간으로
            </button>
          </section>
        </div>
      ) : null}

      <div className="session-actions">
        {phase === "idle" ? (
          <>
            <button type="button" className="button button--ghost" onClick={() => navigate("/mode")}>
              루틴으로
            </button>
            <button type="button" className="button button--primary" onClick={() => void begin()} disabled={camera.status !== "ready"}>
              시작
            </button>
          </>
        ) : null}
        {phase === "running" ? (
          <>
            <button type="button" className="button button--ghost" onClick={() => void finish(true)}>
              건너뛰기
            </button>
            <button type="button" className="button button--primary" onClick={() => void finish(false)}>
              결과 받기
            </button>
          </>
        ) : null}
        {phase === "pending_result" ? (
          <button type="button" className="button button--primary" onClick={() => void finish(pendingSkippedRef.current)}>
            결과 받기 재시도
          </button>
        ) : null}
        {phase === "starting" || phase === "stopping" || phase === "skipping" ? <button type="button" className="button button--primary" disabled>처리 중</button> : null}
      </div>
    </main>
  );
}
