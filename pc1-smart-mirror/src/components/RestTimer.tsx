import { useEffect, useState, type RefObject } from "react";

import BackButton from "./BackButton";

type RestTimerProps = {
  seconds: number;
  completedExercise: string;
  nextExercise: string;
  nextDetail: string;
  onDone: () => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onVideoReady?: () => void | Promise<void>;
};

export default function RestTimer({ seconds, completedExercise, nextExercise, nextDetail, onDone, videoRef, onVideoReady }: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds);
  const progress = seconds > 0 ? remaining / seconds : 0;
  const dashOffset = 327 * (1 - progress);

  useEffect(() => {
    void onVideoReady?.();
  }, [onVideoReady]);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return undefined;
    }
    const id = window.setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [onDone, remaining]);

  return (
    <main className="rest-page">
      <BackButton fallbackTo="/mode" />
      {videoRef ? <video ref={videoRef} className="rest-video" autoPlay muted playsInline /> : null}
      <span className="eyebrow">REST</span>
      <h1>운동 사이 휴식</h1>
      <p>방금 완료: {completedExercise}</p>
      <div className="rest-ring" aria-label={`남은 휴식 ${remaining}초`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" className="rest-ring__base" />
          <circle cx="60" cy="60" r="52" className="rest-ring__fill" strokeDasharray="327" strokeDashoffset={dashOffset} />
        </svg>
        <strong>{remaining}</strong>
      </div>
      <section className="panel rest-next">
        <span>다음 운동</span>
        <strong>{nextExercise}</strong>
        <em>{nextDetail}</em>
      </section>
      <button type="button" className="button button--ghost" onClick={onDone}>
        휴식 건너뛰기
      </button>
    </main>
  );
}
