import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import BackButton from "../components/BackButton";
import { useCamera } from "../hooks/useCamera";
import { captureBaseline, getBaselineStatus } from "../services/api";
import { saveProfilePhoto } from "../services/profilePhoto";
import { useAppState } from "../state/AppContext";
import type { BaselineSlot } from "../types/domain";
import { friendlyError } from "../utils/format";

const SLOT_ORDER: BaselineSlot[] = ["face_front", "body_front_full"];
const SLOT_LABEL: Record<BaselineSlot, string> = {
  face_front: "얼굴 정면",
  body_front_full: "전신 정면",
};
const AUTO_CAPTURE_RETRY_MS = 900;
const CAMERA_WARMUP_MS = 1200;
type FrameQuality = {
  ok: boolean;
  reason: string;
  brightness: number;
  contrast: number;
  edgeDensity: number;
  lowerEdgeDensity: number;
};

type BaselineFrame = {
  blob: Blob;
  quality: FrameQuality;
};

type PoseReadyState = {
  ready: boolean;
  message: string;
  blob: Blob | null;
};

function guideBounds(slot: BaselineSlot, width: number, height: number) {
  if (slot === "body_front_full") {
    return {
      x: Math.round(width * 0.35),
      y: Math.round(height * 0.08),
      width: Math.round(width * 0.3),
      height: Math.round(height * 0.8),
    };
  }
  return {
    x: Math.round(width * 0.31),
    y: Math.round(height * 0.14),
    width: Math.round(width * 0.38),
    height: Math.round(height * 0.5),
  };
}

function evaluateFrameQuality(context: CanvasRenderingContext2D, slot: BaselineSlot, width: number, height: number): FrameQuality {
  const bounds = guideBounds(slot, width, height);
  const gridWidth = 44;
  const gridHeight = 52;
  const gray = new Float32Array(gridWidth * gridHeight);
  const image = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height).data;
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let bright = 0;

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const sourceX = Math.min(bounds.width - 1, Math.floor((x + 0.5) * bounds.width / gridWidth));
      const sourceY = Math.min(bounds.height - 1, Math.floor((y + 0.5) * bounds.height / gridHeight));
      const offset = (sourceY * bounds.width + sourceX) * 4;
      const value = image[offset] * 0.299 + image[offset + 1] * 0.587 + image[offset + 2] * 0.114;
      gray[y * gridWidth + x] = value;
      sum += value;
      sumSq += value * value;
      if (value < 32) {
        dark += 1;
      }
      if (value > 232) {
        bright += 1;
      }
    }
  }

  let edgeHits = 0;
  let edgeTotal = 0;
  const bandHits = [0, 0, 0];
  const bandTotal = [0, 0, 0];

  for (let y = 1; y < gridHeight; y += 1) {
    for (let x = 1; x < gridWidth; x += 1) {
      const index = y * gridWidth + x;
      const delta = Math.abs(gray[index] - gray[index - 1]) + Math.abs(gray[index] - gray[index - gridWidth]);
      const hit = delta > 28 ? 1 : 0;
      const band = Math.min(2, Math.floor(y / (gridHeight / 3)));
      edgeHits += hit;
      edgeTotal += 1;
      bandHits[band] += hit;
      bandTotal[band] += 1;
    }
  }

  const samples = gridWidth * gridHeight;
  const brightness = sum / samples;
  const variance = Math.max(0, sumSq / samples - brightness * brightness);
  const contrast = Math.sqrt(variance);
  const edgeDensity = edgeTotal ? edgeHits / edgeTotal : 0;
  const darkRatio = dark / samples;
  const brightRatio = bright / samples;
  const lowerEdgeDensity = bandTotal[2] ? bandHits[2] / bandTotal[2] : 0;
  const minContrast = slot === "body_front_full" ? 22 : 18;
  const minEdgeDensity = slot === "body_front_full" ? 0.085 : 0.065;

  if (brightness < 34 || darkRatio > 0.72) {
    return { ok: false, reason: "화면이 너무 어두워요. 조명을 켜고 가이드 안에 서주세요.", brightness, contrast, edgeDensity, lowerEdgeDensity };
  }
  if (brightness > 226 || brightRatio > 0.72) {
    return { ok: false, reason: "화면이 너무 밝아요. 빛 반사를 줄이고 다시 맞춰주세요.", brightness, contrast, edgeDensity, lowerEdgeDensity };
  }
  if (contrast < minContrast || edgeDensity < minEdgeDensity) {
    return { ok: false, reason: slot === "body_front_full" ? "전신이 가이드 안에 보이게 한 걸음 뒤로 이동해주세요." : "얼굴이 중앙 가이드 안에 보이게 맞춰주세요.", brightness, contrast, edgeDensity, lowerEdgeDensity };
  }
  if (slot === "body_front_full" && lowerEdgeDensity < 0.035) {
    return { ok: false, reason: "발끝까지 보이게 뒤로 이동해서 전신을 맞춰주세요.", brightness, contrast, edgeDensity, lowerEdgeDensity };
  }

  return { ok: true, reason: "프레임 품질 확인 완료", brightness, contrast, edgeDensity, lowerEdgeDensity };
}

async function captureBaselineFrame(video: HTMLVideoElement, slot: BaselineSlot): Promise<BaselineFrame | null> {
  if (video.readyState < 2) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const quality = evaluateFrameQuality(context, slot, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", slot === "face_front" ? 0.72 : 0.84));
  return blob ? { blob, quality } : null;
}

export default function BaselineSetupPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const profile = app.activeProfile;
  const camera = useCamera();
  const [completed, setCompleted] = useState<Record<BaselineSlot, boolean>>({ face_front: false, body_front_full: false });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("카메라를 켜고 기준 촬영을 준비하고 있습니다.");
  const [error, setError] = useState<string | null>(null);
  const [autoAttempt, setAutoAttempt] = useState(0);
  const [retrySeed, setRetrySeed] = useState(0);
  const [cameraReadyAt, setCameraReadyAt] = useState<number | null>(null);
  const [poseReady, setPoseReady] = useState<PoseReadyState>({ ready: false, message: "", blob: null });

  const currentSlot = useMemo(() => SLOT_ORDER.find((slot) => !completed[slot]) ?? null, [completed]);
  const progressLabel = currentSlot ? `${SLOT_ORDER.indexOf(currentSlot) + 1}/${SLOT_ORDER.length}` : "완료";

  useEffect(() => {
    void camera.start();
  }, [camera.start]);

  useEffect(() => {
    setPoseReady({ ready: false, message: "", blob: null });
  }, [currentSlot]);

  useEffect(() => {
    setCameraReadyAt(camera.status === "ready" ? Date.now() : null);
  }, [camera.status]);

  const finalize = useCallback(
    async (nextCompleted: Record<BaselineSlot, boolean>) => {
      if (!profile || !nextCompleted.face_front || !nextCompleted.body_front_full) {
        return;
      }
      setMessage("저장된 기준 촬영 상태를 확인하고 있습니다.");
      const status = await getBaselineStatus(profile.id);
      if (!status.face || !status.body) {
        throw new Error("기준 촬영 저장 상태를 확인하지 못했습니다. 다시 촬영해주세요.");
      }
      const readyProfile = {
        ...profile,
        status: "ready" as const,
        baselineSlots: { face_front: true, body_front_full: true },
        lastUsedAt: new Date().toISOString(),
      };
      app.upsertProfile(readyProfile);
      app.setActiveProfileId(readyProfile.id);
      navigate("/mode", { replace: true });
    },
    [app, navigate, profile],
  );

  const inspectPose = useCallback(async () => {
    if (!profile || !currentSlot || submitting || camera.status !== "ready") {
      return;
    }

    const slot = currentSlot;
    setSubmitting(true);
    setError(null);
    setMessage(`${SLOT_LABEL[slot]} 프레임 품질을 확인하고 있습니다.`);
    try {
      const video = camera.videoRef.current;
      const frame = video ? await captureBaselineFrame(video, slot) : null;
      if (!frame) {
        throw new Error("카메라 프레임을 가져오지 못했습니다.");
      }
      if (!frame.quality.ok) {
        setPoseReady({ ready: false, message: frame.quality.reason, blob: null });
        setMessage(frame.quality.reason);
        setAutoAttempt((value) => value + 1);
        return;
      }

      setMessage(`${SLOT_LABEL[slot]} 프레임을 확인하고 있습니다.`);
      const result = await captureBaseline(profile.id, slot, frame.blob);
      if (!result.valid) {
        const reason = result.reason ?? `${SLOT_LABEL[slot]} 위치를 조금 더 중앙에 맞춰주세요.`;
        setPoseReady({ ready: false, message: reason, blob: null });
        setMessage(reason);
        setAutoAttempt((value) => value + 1);
        return;
      }

      const readyMessage = slot === "body_front_full" ? "전신 위치 확인 완료. 촬영할 수 있어요." : "얼굴 위치 확인 완료. 촬영할 수 있어요.";
      setPoseReady({ ready: true, message: readyMessage, blob: frame.blob });
      setMessage(readyMessage);
    } catch (caught) {
      setPoseReady({ ready: false, message: "", blob: null });
      setError(friendlyError(caught, "기준 촬영 위치를 확인하지 못했습니다. 다시 시도해주세요."));
      setMessage("촬영 위치를 조정한 뒤 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [camera.status, camera.videoRef, currentSlot, profile, submitting]);

  const saveCapture = useCallback(async () => {
    if (!profile || !currentSlot || submitting || !poseReady.ready || !poseReady.blob) {
      return;
    }

    const slot = currentSlot;
    setSubmitting(true);
    setError(null);
    setMessage(`${SLOT_LABEL[slot]} 기준 사진을 저장하고 있습니다.`);
    try {
      const blob = poseReady.blob;
      if (slot === "face_front") {
        await saveProfilePhoto(profile.id, blob);
      }
      const next = { ...completed, [slot]: true };
      setCompleted(next);
      app.updateActiveProfile({ baselineSlots: next });
      setMessage(`${SLOT_LABEL[slot]} OK. 저장 완료.`);
      setPoseReady({ ready: false, message: "", blob: null });
      await finalize(next);
    } catch (caught) {
      setError(friendlyError(caught, "기준 촬영을 저장하지 못했습니다. 다시 시도해주세요."));
      setMessage("촬영 위치를 조정한 뒤 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [app, completed, currentSlot, finalize, poseReady.blob, poseReady.ready, profile, submitting]);

  useEffect(() => {
    if (!profile || !currentSlot || submitting || error || poseReady.ready || camera.status !== "ready") {
      return;
    }

    const readyElapsed = cameraReadyAt ? Date.now() - cameraReadyAt : 0;
    const warmupRemaining = Math.max(0, CAMERA_WARMUP_MS - readyElapsed);
    setMessage(warmupRemaining > 0 ? "카메라 노출을 안정화하고 있습니다." : `${SLOT_LABEL[currentSlot]} 프레임을 맞추면 촬영 버튼이 켜집니다.`);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void inspectPose();
      }
    }, Math.max(AUTO_CAPTURE_RETRY_MS, warmupRemaining));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoAttempt, camera.status, cameraReadyAt, currentSlot, error, inspectPose, poseReady.ready, profile, retrySeed, submitting]);

  if (!profile) {
    return (
      <main className="capture-page">
        <BackButton fallbackTo="/profile-select" />
        <button type="button" className="button button--primary" onClick={() => navigate("/profile-select")}>
          프로필 선택
        </button>
      </main>
    );
  }

  const retryAutoCapture = () => {
    setError(null);
    setPoseReady({ ready: false, message: "", blob: null });
    setMessage(currentSlot ? `${SLOT_LABEL[currentSlot]} 프레임을 다시 확인합니다.` : "기준 촬영을 다시 확인합니다.");
    setAutoAttempt((value) => value + 1);
    setRetrySeed((value) => value + 1);
  };

  const captureStateLabel = poseReady.ready ? "OK" : "READY";

  return (
    <main className={`capture-page capture-page--${currentSlot ?? "done"}`}>
      <BackButton fallbackTo="/baseline-check" />
      <video ref={camera.videoRef} className="capture-video" autoPlay muted playsInline />
      {camera.status !== "ready" ? (
        <div className="camera-placeholder">
          <p>{camera.error ?? "카메라를 준비하고 있습니다."}</p>
          <button type="button" className="button button--primary" onClick={() => void camera.start()}>
            카메라 연결
          </button>
        </div>
      ) : null}
      <div className={`capture-guide capture-guide--${currentSlot ?? "done"} ${poseReady.ready ? "is-ready" : ""}`.trim()} aria-hidden="true" />
      {currentSlot && camera.status === "ready" ? (
        <aside className={`capture-countdown ${submitting ? "is-saving" : "is-scanning"} ${poseReady.ready ? "is-ready" : ""}`.trim()} aria-live="polite">
          <span>{poseReady.ready ? "촬영 가능" : submitting ? "위치 확인" : "자동 인식"}</span>
          <strong>{submitting ? "..." : captureStateLabel}</strong>
          <em>{poseReady.ready ? "가이드가 맞았습니다. 촬영하기를 눌러 저장하세요." : submitting ? "위치를 확인하고 있습니다." : `${SLOT_LABEL[currentSlot]} 위치가 맞으면 촬영 버튼이 켜집니다.`}</em>
        </aside>
      ) : null}
      <aside className="capture-toast" role={error ? "alert" : "status"}>
        {error ?? (poseReady.message || message)}
      </aside>
      <footer className="capture-bar">
        <div>
          <span>현재</span>
          <strong>{currentSlot ? SLOT_LABEL[currentSlot] : "완료"}</strong>
          <em>{progressLabel}</em>
        </div>
        <div className="capture-steps">
          {SLOT_ORDER.map((slot) => (
            <span key={slot} className={`${slot === currentSlot ? "is-active" : ""} ${completed[slot] ? "is-done" : ""}`}>
              {SLOT_LABEL[slot]}
            </span>
          ))}
        </div>
        {error ? (
          <button type="button" className="button button--primary" onClick={retryAutoCapture} disabled={!currentSlot || camera.status !== "ready"}>
            다시 자동 확인
          </button>
        ) : (
          <button type="button" className={poseReady.ready ? "button button--primary" : "button button--ghost"} onClick={() => void saveCapture()} disabled={!currentSlot || submitting || camera.status !== "ready" || !poseReady.ready}>
            촬영하기
          </button>
        )}
      </footer>
    </main>
  );
}
