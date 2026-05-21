import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import './ResultPage.css';

const EXERCISE_KO: Record<string, string> = {
  squat: '스쿼트',
  jumping_jack: '점핑잭',
  knee_raise: '니 레이즈',
  lunge: '런지',
  pushup: '푸시업',
};

export default function ResultPage() {
  const navigate = useNavigate();
  const { lastResult, routine, setRoutine, setCurrentExerciseIndex } = useApp();

  const coaching = lastResult?.coaching;
  const exerciseFeature = lastResult?.features as Record<string, unknown> | undefined;
  const exData = exerciseFeature?.exercise as Record<string, unknown> | undefined;
  const displayLines = coaching?.pc2_payload?.display_lines ?? [];
  const evidence = coaching?.pc2_payload?.evidence ?? [];

  function handleHome() {
    setRoutine(null);
    setCurrentExerciseIndex(0);
    navigate('/');
  }

  function handleRoutine() {
    setCurrentExerciseIndex(0);
    navigate('/mode');
  }

  return (
    <div className="result-page">
      <div className="result-card card">
        <div className="result-title">운동 완료</div>

        {coaching?.mirror_message ? (
          <p className="coach-message">&ldquo;{coaching.mirror_message}&rdquo;</p>
        ) : (
          <p className="coach-message">수고하셨습니다. 코칭 결과를 불러왔습니다.</p>
        )}

        <div className="result-summary">
          {exData && (
            <>
              <div className="summary-item">
                <span className="summary-label">운동</span>
                <span className="summary-value">
                  {EXERCISE_KO[String(exData.type ?? '')] ?? String(exData.type ?? '-')}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">횟수</span>
                <span className="summary-value glow">{String(exData.count ?? '-')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">안정성</span>
                <span className="summary-value">
                  {exData.stability_score != null
                    ? `${Math.round(Number(exData.stability_score) * 100)}%`
                    : '-'}
                </span>
              </div>
            </>
          )}
          {coaching?.summary && (
            <div className="summary-item full">
              <span className="summary-label">요약</span>
              <span className="summary-value">{coaching.summary}</span>
            </div>
          )}
        </div>

        {displayLines.length > 0 && (
          <div className="coach-lines">
            <div className="section-title">코칭</div>
            <ul>
              {displayLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {coaching?.warnings && coaching.warnings.length > 0 && (
          <div className="warnings">
            {coaching.warnings.map((warning: string, index: number) => (
              <div key={index} className="warning-item">주의: {warning}</div>
            ))}
          </div>
        )}

        {evidence.length > 0 && (
          <div className="result-evidence">
            <div className="section-title">근거</div>
            {evidence.slice(0, 5).map((item, index) => (
              <p key={index}>
                <strong>{item.title || item.source_title || item.summary || item.text || '운동 근거'}</strong>
                {(item.exercise || item.category) && (
                  <span>{[item.exercise, item.category].filter(Boolean).join(' · ')}</span>
                )}
              </p>
            ))}
          </div>
        )}

        <div className="result-actions">
          {routine && routine.items.length > 1 && (
            <button className="btn-outline" onClick={handleRoutine}>
              운동 홈
            </button>
          )}
          <button className="btn-primary" onClick={handleHome}>
            프로필로
          </button>
        </div>
      </div>
    </div>
  );
}
