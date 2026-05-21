import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { startSession, uploadFrame, stopSession, skipSession } from '../services/api';
import type { RoutineItem, SessionStopResponse } from '../services/api';
import { SessionWs } from '../services/ws';
import type { WsExerciseUpdate } from '../services/ws';
import RestTimer from '../components/RestTimer';
import './CameraPage.css';

const EXERCISE_KO: Record<string, string> = {
  squat: '스쿼트',
  jumping_jack: '점핑잭',
  knee_raise: '니 레이즈',
  lunge: '런지',
  pushup: '푸시업',
};
const FAST_CADENCE = new Set(['knee_raise', 'jumping_jack']);
const BLOCKING_STATUSES = new Set(['target_recovering', 'target_lost', 'multi_person_detected']);
const REST_SECONDS = 60;

function getCadence(exerciseType: string): number {
  return FAST_CADENCE.has(exerciseType) ? 200 : 300;
}

function targetBadgeClass(status: string) {
  if (status === 'tracking') return 'badge-ok';
  if (BLOCKING_STATUSES.has(status)) return 'badge-err';
  return 'badge-warn';
}

function targetBadgeLabel(status: string) {
  const map: Record<string, string> = {
    tracking: '추적 중',
    target_locked: '대상 고정',
    target_recovering: '복구 중',
    target_lost: '추적 실패',
    multi_person_detected: '여러 명 감지',
    person_too_far: '너무 멀리 있음',
    partial_body: '몸 일부만 보임',
    low_confidence: '신뢰도 낮음',
    model_disagreement: '분석 차이',
    idle: '대기 중',
  };
  return map[status] ?? status;
}

function exerciseName(type: string) {
  return EXERCISE_KO[type] ?? type;
}

function itemDetail(item?: RoutineItem) {
  if (!item) return '';
  const target = item.reps ? `${item.reps}회` : `${item.duration_sec ?? 0}초`;
  return `${item.sets}세트 x ${target} · 휴식 ${item.rest_sec}초`;
}

export default function CameraPage() {
  const navigate = useNavigate();
  const { activeProfile, routine, currentExerciseIndex, setCurrentExerciseIndex, setLastResult } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<SessionWs | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameInFlightRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<'starting' | 'running' | 'stopping' | 'rest' | 'coaching' | 'skipping'>('starting');
  const [wsData, setWsData] = useState<Partial<WsExerciseUpdate>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [currentStopResult, setCurrentStopResult] = useState<SessionStopResponse | null>(null);

  const currentItem = routine?.items[currentExerciseIndex];
  const nextItem = routine?.items[currentExerciseIndex + 1];
  const exerciseType = currentItem?.exercise_type ?? 'squat';
  const totalExercises = routine?.items.length ?? 1;
  const isLastExercise = !routine || currentExerciseIndex >= totalExercises - 1;

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('이 WebView에서 카메라 API를 사용할 수 없습니다.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch((error) => {
            console.warn('Camera preview play failed', error);
          });
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error('Camera start failed', error);
        setCameraError(message);
      }
    }
    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cameraError || sessionError || !activeProfile || phase !== 'starting') return;
    async function beginSession() {
      if (!activeProfile) return;
      try {
        const session = await startSession(
          activeProfile.id,
          exerciseType,
          routine?.routine_id,
          routine?.routine_day_id,
        );
        sessionIdRef.current = session.session_id;
        wsRef.current = new SessionWs(session.ws_url, session.session_id, (msg) => {
          setWsData(msg);
        });
        setCurrentStopResult(null);
        setPhase('running');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('PC3 session start failed', error);
        setSessionError(message);
      }
    }
    beginSession();
    return () => {
      wsRef.current?.close();
    };
  }, [phase, cameraError, sessionError, activeProfile, exerciseType, routine?.routine_id, routine?.routine_day_id]);

  const captureFrame = useCallback(async () => {
    if (frameInFlightRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    frameInFlightRef.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) { frameInFlightRef.current = false; return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) { frameInFlightRef.current = false; return; }
      try {
        await uploadFrame(sessionId, blob);
      } catch {
        // 개별 프레임 실패는 다음 프레임으로 회복한다.
      } finally {
        frameInFlightRef.current = false;
      }
    }, 'image/jpeg', 0.82);
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const cadence = getCadence(exerciseType);
    frameTimerRef.current = setInterval(captureFrame, cadence);
    return () => {
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    };
  }, [phase, exerciseType, captureFrame]);

  function stopLiveLoop() {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    frameTimerRef.current = null;
    wsRef.current?.close();
  }

  function resetForNextSession() {
    sessionIdRef.current = null;
    wsRef.current = null;
    setWsData({});
    setCurrentStopResult(null);
  }

  async function handleStop() {
    if (phase !== 'running') return;
    setPhase('stopping');
    stopLiveLoop();

    const sessionId = sessionIdRef.current;
    if (!sessionId) { navigate('/result'); return; }

    try {
      const result = await stopSession(sessionId);
      if (isLastExercise) {
        setLastResult(result);
        navigate('/result');
      } else {
        setCurrentStopResult(result);
        setPhase('coaching');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessionError(message);
    }
  }

  async function handleSkipExercise() {
    if (phase !== 'running') return;
    setPhase('skipping');
    stopLiveLoop();
    const sessionId = sessionIdRef.current;
    try {
      if (sessionId) await skipSession(sessionId, '운동을 수행하기 어려워 넘김');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessionError(message);
      return;
    }
    if (isLastExercise) {
      resetForNextSession();
      navigate('/mode');
      return;
    }
    setPhase('rest');
  }

  function handleContinueAfterCoaching() {
    if (isLastExercise) {
      navigate('/result');
      return;
    }
    setPhase('rest');
  }

  function handleRestDone() {
    const nextIndex = currentExerciseIndex + 1;
    setCurrentExerciseIndex(nextIndex);
    resetForNextSession();
    setPhase('starting');
  }

  if (cameraError || sessionError) {
    const title = cameraError ? '카메라를 사용할 수 없습니다' : 'PC3 운동 세션을 시작할 수 없습니다';
    const detail = cameraError ?? sessionError;

    return (
      <div className="camera-page">
        <div className="cam-error-overlay card">
          <p style={{ color: 'var(--error)', marginBottom: '0.65rem' }}>{title}</p>
          {detail && (
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {detail}
            </p>
          )}
          <button className="btn-primary" onClick={() => navigate('/mode')}>돌아가기</button>
        </div>
      </div>
    );
  }

  if (phase === 'rest' && routine) {
    return (
      <RestTimer
        seconds={REST_SECONDS}
        completedExercise={exerciseName(exerciseType)}
        nextExercise={nextItem ? exerciseName(nextItem.exercise_type) : ''}
        nextDetail={itemDetail(nextItem)}
        onDone={handleRestDone}
      />
    );
  }

  const count = wsData.count ?? 0;
  const stability = wsData.stability_score ?? 0;
  const feedback = wsData.feedback ?? '';
  const postureErrors = wsData.posture_errors ?? [];
  const targetStatus = wsData.target_status ?? 'idle';
  const isBlocking = BLOCKING_STATUSES.has(targetStatus);
  const displayLines = currentStopResult?.coaching.pc2_payload?.display_lines ?? [];
  const evidence = currentStopResult?.coaching.pc2_payload?.evidence ?? [];

  return (
    <div className="camera-page">
      <video ref={videoRef} className="cam-feed" muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="hud-top">
        <div className="hud-errors">
          {postureErrors.map((err, i) => (
            <div key={i} className="error-tag">주의: {err}</div>
          ))}
        </div>

        <div className="hud-count">
          <div className="exercise-step">운동 {currentExerciseIndex + 1} / {totalExercises}</div>
          <div className="exercise-label">{exerciseName(exerciseType)}</div>
          <div className={`count-number glow ${isBlocking ? 'frozen' : ''}`}>{count}</div>
          <div className="exercise-target">{itemDetail(currentItem)}</div>
          {nextItem && <div className="next-target">다음: {exerciseName(nextItem.exercise_type)}</div>}
        </div>

        <div className="hud-right">
          <div className="stability-block">
            <span className="stability-value">{Math.round(stability * 100)}%</span>
            <span className="stability-label">안정성</span>
          </div>
          <div className={`target-badge ${targetBadgeClass(targetStatus)}`}>
            {targetBadgeLabel(targetStatus)}
          </div>
        </div>
      </div>

      {targetStatus === 'multi_person_detected' && (
        <div className="multi-person-overlay">
          <div className="multi-person-msg card">한 명만 화면에 들어와야 합니다</div>
        </div>
      )}

      {(phase === 'starting' || phase === 'stopping' || phase === 'skipping') && (
        <div className="phase-overlay">
          <div className="loading-spinner" />
          <p>
            {phase === 'starting' && '세션 준비 중...'}
            {phase === 'stopping' && '운동 결과와 코칭을 생성 중...'}
            {phase === 'skipping' && '이 운동을 넘기는 중...'}
          </p>
        </div>
      )}

      {phase === 'coaching' && (
        <div className="coaching-overlay">
          <div className="coaching-panel card">
            <p className="overlay-kicker">운동 완료</p>
            <h2>{exerciseName(exerciseType)} 코칭</h2>
            {currentStopResult?.coaching.mirror_message && (
              <p className="overlay-message">{currentStopResult.coaching.mirror_message}</p>
            )}
            {displayLines.length > 0 && (
              <ul className="overlay-lines">
                {displayLines.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            )}
            {evidence.length > 0 && (
              <div className="overlay-evidence">
                근거: {evidence.slice(0, 2).map((item) => item.title || item.source_title || item.summary || item.text).filter(Boolean).join(' · ')}
              </div>
            )}
            <button className="btn-primary" onClick={handleContinueAfterCoaching}>다음 구간으로</button>
          </div>
        </div>
      )}

      <div className="hud-bottom">
        <div className="feedback-text">{feedback || '전신이 화면에 들어오게 서서 천천히 진행하세요.'}</div>
        <div className="exercise-actions">
          <button
            className="skip-exercise-btn"
            onClick={handleSkipExercise}
            disabled={phase !== 'running'}
          >
            넘기기
          </button>
          <button
            className="stop-btn"
            onClick={handleStop}
            disabled={phase !== 'running'}
          >
            종료
          </button>
        </div>
      </div>
    </div>
  );
}
