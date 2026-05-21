import { useEffect, useState } from 'react';
import './RestTimer.css';

interface Props {
  seconds: number;
  nextExercise: string;
  completedExercise?: string;
  nextDetail?: string;
  onDone: () => void;
}

export default function RestTimer({ seconds, nextExercise, completedExercise, nextDetail, onDone }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, onDone]);

  const progress = (remaining / seconds) * 100;

  return (
    <div className="rest-page">
      <div className="rest-label">운동 사이 휴식</div>
      {completedExercise && <div className="rest-done">방금 완료: {completedExercise}</div>}

      <div className="rest-timer-ring">
        <svg viewBox="0 0 120 120" className="ring-svg">
          <circle cx="60" cy="60" r="52" className="ring-bg" />
          <circle
            cx="60"
            cy="60"
            r="52"
            className="ring-fill"
            strokeDasharray={`${2 * Math.PI * 52}`}
            strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress / 100)}`}
          />
        </svg>
        <div className="rest-seconds">{remaining}</div>
      </div>

      {nextExercise && (
        <div className="rest-next">
          <span className="rest-next-label">다음 운동</span>
          <span className="rest-next-name glow">{nextExercise}</span>
          {nextDetail && <span className="rest-next-detail">{nextDetail}</span>}
        </div>
      )}

      <button className="btn-outline skip-rest" onClick={onDone}>
        휴식 건너뛰기
      </button>
    </div>
  );
}
