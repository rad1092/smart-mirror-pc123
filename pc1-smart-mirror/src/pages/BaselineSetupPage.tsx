import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { captureBaseline } from '../services/api';
import './BaselineSetupPage.css';

type Slot = 'face_front' | 'body_front_full';

const SLOTS: Slot[] = ['face_front', 'body_front_full'];
const AUTO_CAPTURE_DELAY = 450;

function slotLabel(slot: Slot) {
  return slot === 'face_front' ? '얼굴 정면' : '전신 정면';
}

function slotGuideText(slot: Slot) {
  return slot === 'face_front'
    ? '얼굴을 가운데 원에 맞춰주세요.'
    : '머리부터 발끝까지 전신이 화면에 들어오게 서 주세요.';
}

export default function BaselineSetupPage() {
  const navigate = useNavigate();
  const { activeProfile, setBaselineReady } = useApp();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slotIndex, setSlotIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>([false, false]);
  const [status, setStatus] = useState<'idle' | 'holding' | 'capturing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const currentSlot = SLOTS[slotIndex];

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
            console.warn('Baseline camera preview play failed', error);
          });
        }
        setStatus('idle');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error('Baseline camera start failed', error);
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
    if (status === 'idle' && !cameraError) {
      holdTimerRef.current = setTimeout(() => {
        setStatus('holding');
        setTimeout(() => handleCapture(), AUTO_CAPTURE_DELAY);
      }, 1000);
    }
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [slotIndex, status, cameraError]);

  async function handleCapture() {
    if (!activeProfile || !videoRef.current || !canvasRef.current) return;
    setStatus('capturing');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) { setStatus('idle'); return; }
      try {
        const result = await captureBaseline(activeProfile.id, currentSlot, blob);
        if (result.valid) {
          const next = [...completed];
          next[slotIndex] = true;
          setCompleted(next);
          if (slotIndex < SLOTS.length - 1) {
            setSlotIndex((i) => i + 1);
            setStatus('idle');
          } else {
            setStatus('done');
            setBaselineReady(true);
            setTimeout(() => navigate('/mode'), 1200);
          }
        } else {
          setErrorMsg(result.reason ?? '다시 시도해 주세요.');
          setStatus('error');
          setTimeout(() => setStatus('idle'), 2000);
        }
      } catch {
        setErrorMsg('서버 연결에 실패했습니다.');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 2000);
      }
    }, 'image/jpeg', 0.85);
  }

  function handleManualCapture() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setStatus('holding');
    void handleCapture();
  }

  function handleSkip() {
    setBaselineReady(false);
    navigate('/mode');
  }

  return (
    <div className="baseline-setup-page">
      {cameraError ? (
        <div className="camera-error card">
          <p>카메라를 사용할 수 없습니다.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            {cameraError}
          </p>
          <button className="btn-primary" onClick={handleSkip} style={{ marginTop: '1rem' }}>
            건너뛰기
          </button>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="camera-feed" muted playsInline />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div className={`guide-overlay ${currentSlot}`}>
            {currentSlot === 'face_front' ? (
              <div className="guide-oval" />
            ) : (
              <div className="guide-silhouette" />
            )}
            <p className="guide-text">{slotGuideText(currentSlot)}</p>
          </div>

          {status === 'holding' && (
            <div className="capture-banner holding">그대로 잠시 멈춰 주세요...</div>
          )}
          {status === 'capturing' && (
            <div className="capture-banner capturing">캡처 중...</div>
          )}
          {status === 'error' && (
            <div className="capture-banner error">{errorMsg}</div>
          )}
          {status === 'done' && (
            <div className="capture-banner done">완료! 운동 홈으로 이동합니다...</div>
          )}

          <div className="slot-status-bar">
            <div className="slot-status-title">
              현재: <span className="glow">{slotLabel(currentSlot)}</span>
            </div>
            <div className="slot-indicators">
              {SLOTS.map((slot, i) => (
                <div key={slot} className={`slot-pill ${completed[i] ? 'done' : i === slotIndex ? 'active' : 'pending'}`}>
                  {completed[i] ? '완료' : i === slotIndex ? '진행 중' : '대기'}&nbsp;{slotLabel(slot)}
                </div>
              ))}
            </div>
            <div className="slot-actions">
              <button className="btn-outline" onClick={handleManualCapture} disabled={status === 'capturing'}>
                수동 캡처
              </button>
              <button className="btn-outline" onClick={handleSkip} style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                건너뛰기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
