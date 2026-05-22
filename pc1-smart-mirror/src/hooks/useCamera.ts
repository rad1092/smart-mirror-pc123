import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export type CameraController = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  capture: (quality?: number) => Promise<Blob | null>;
};

export function useCamera(): CameraController {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) {
      if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setError("카메라를 사용할 수 없습니다.");
      return;
    }
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus("ready");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "카메라 연결에 실패했습니다.";
      setStatus(message.toLowerCase().includes("permission") ? "denied" : "error");
      setError(message);
    }
  }, []);

  const capture = useCallback(async (quality = 0.82): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }, []);

  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ videoRef, status, error, start, stop, capture }), [capture, error, start, status, stop]);
}
