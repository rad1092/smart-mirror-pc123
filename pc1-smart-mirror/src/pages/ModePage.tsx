import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  getBaselineStatus,
  getCoachLogs,
  getProgress,
  getRoutine,
  getRoutineCalendar,
  getRoutineDay,
  saveBodyMetric,
} from '../services/api';
import type {
  BaselineStatus,
  CalendarDay,
  CalendarResponse,
  CoachLog,
  EvidenceItem,
  ProgressResponse,
  RoutineDayResponse,
  RoutineItem,
  RoutineResponse,
  SessionStopResponse,
  WeeklyAdjustment,
  WeeklyRoutineExercise,
} from '../services/api';
import './ModePage.css';

const EXERCISE_KO: Record<string, string> = {
  squat: '스쿼트',
  jumping_jack: '점핑잭',
  knee_raise: '니 레이즈',
  lunge: '런지',
  pushup: '푸시업',
};

function exKo(type: string) {
  return EXERCISE_KO[type] ?? type;
}

function localDateString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function offsetDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function baselineComplete(status: BaselineStatus | null) {
  const baseline = status?.baseline as Record<string, Record<string, { captured?: boolean }> | undefined> | undefined;
  const face = baseline?.face?.face_front;
  const body = baseline?.body?.body_front_full;
  return status?.source === 'user' && Boolean(face?.captured && body?.captured);
}

function estimateMinutes(exercises: WeeklyRoutineExercise[]) {
  const seconds = exercises.reduce((sum, item) => {
    const work = item.duration_sec ?? ((item.reps ?? 10) * 3);
    const rest = item.rest_sec ?? 45;
    return sum + (item.sets ?? 1) * (work + rest);
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

function routineItemsFromExercises(exercises: WeeklyRoutineExercise[]): RoutineItem[] {
  return exercises.map((item) => ({
    exercise_type: item.exercise,
    title: exKo(item.exercise),
    reps: item.reps ?? null,
    sets: item.sets ?? 1,
    rest_sec: item.rest_sec ?? 45,
    focus: item.focus,
    summary: item.reason ?? '',
    reason: item.reason ?? '',
    how_to: item.how_to ?? '',
    tips: item.tips ?? '',
    duration_sec: item.duration_sec ?? null,
  }));
}

function routineFromDay(day: RoutineDayResponse): RoutineResponse {
  const items = routineItemsFromExercises(day.exercises);
  return {
    source: 'ai',
    difficulty: 'normal',
    title: day.message || day.focus || '오늘 루틴',
    description: day.summary || day.weekly_focus || '',
    reason_lines: [day.weekly_focus, day.focus].filter(Boolean),
    estimated_minutes: estimateMinutes(day.exercises),
    start_exercise_type: items[0]?.exercise_type ?? 'squat',
    items,
    routine_id: day.routine_id,
    routine_day_id: day.routine_day_id,
    scheduled_dates: [day.scheduled_date],
    weekly_routine: [
      {
        day_index: day.day_index,
        day_label: day.day_label,
        focus: day.focus,
        exercises: day.exercises,
      },
    ],
  };
}

function evidenceFromProgress(progress: ProgressResponse | null, routine: RoutineResponse | null): EvidenceItem[] {
  const direct = routine?.evidence ?? routine?.pc3_payload?.evidence;
  if (direct?.length) return direct;
  const latest = progress?.latest_routine?.routine_response;
  return latest?.pc3_payload?.evidence ?? latest?.evidence ?? [];
}

function historyFromProgress(progress: ProgressResponse | null, routine: RoutineResponse | null) {
  const direct = routine?.history_summary ?? routine?.pc3_payload?.history_summary;
  if (direct && Object.keys(direct).length > 0) return direct;
  const latest = progress?.latest_routine?.routine_response;
  return latest?.pc3_payload?.history_summary ?? latest?.history_summary ?? {};
}

function adjustmentFromProgress(progress: ProgressResponse | null, routine: RoutineResponse | null): WeeklyAdjustment | null {
  const direct = routine?.weekly_adjustment ?? routine?.pc3_payload?.weekly_adjustment;
  if (direct) return direct;
  const latest = progress?.latest_routine?.routine_response;
  return latest?.pc3_payload?.weekly_adjustment ?? latest?.weekly_adjustment ?? null;
}

function coachingEvidence(logs: CoachLog[], lastResult: SessionStopResponse | null): EvidenceItem[] {
  const fromLast = lastResult?.coaching.pc2_payload?.evidence;
  if (fromLast?.length) return fromLast;
  for (const log of logs) {
    const evidence = log.final_response?.pc2_payload?.evidence;
    if (evidence?.length) return evidence;
  }
  return [];
}

function coachingLines(log: CoachLog) {
  return log.final_response?.pc2_payload?.display_lines ?? [];
}

function coachingTitle(log: CoachLog) {
  return (
    log.final_response?.summary
    || log.final_response?.mirror_message
    || String(log.pc2_output?.summary ?? log.purpose ?? '코칭 기록')
  );
}

function formatEvidence(item: EvidenceItem) {
  const title = item.title || item.source_title || item.summary || item.text || '근거';
  const meta = [item.exercise, item.category].filter(Boolean).join(' · ');
  return { title, meta };
}

function formatWeightDelta(delta: number | null) {
  if (delta == null) return '기록 부족';
  if (delta > 0) return `+${delta.toFixed(1)}kg`;
  return `${delta.toFixed(1)}kg`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return '0분';
  return `${Math.round(seconds / 60)}분`;
}

function workoutCountText(day: CalendarDay) {
  const isSkipped = (item: Record<string, unknown>) => {
    const result = item.result && typeof item.result === 'object' ? item.result as Record<string, unknown> : {};
    return item.status === 'skipped' || result.status === 'skipped';
  };
  const completed = day.workout_results.filter((item) => !isSkipped(item)).length;
  const skipped = day.skipped_count ?? day.workout_results.filter((item) => isSkipped(item)).length;
  const parts = [];
  if (completed) parts.push(`${completed}개 완료`);
  if (skipped) parts.push(`${skipped}개 스킵`);
  return parts.join(' · ');
}

function adjustmentLabel(adjustment: WeeklyAdjustment) {
  const percent = Number(adjustment.volume_change_percent || 0);
  if (adjustment.direction === 'increase') return `이번 주 조절: ${percent}% 증가`;
  if (adjustment.direction === 'decrease') return `이번 주 조절: ${Math.abs(percent)}% 감소`;
  if (adjustment.direction === 'hold_or_decrease') return '이번 주 조절: 강도 증가 보류';
  return '이번 주 조절: 유지';
}

export default function ModePage() {
  const navigate = useNavigate();
  const {
    activeProfile,
    routine,
    lastResult,
    setBaselineReady,
    setRoutine,
    setCurrentExerciseIndex,
  } = useApp();

  const today = useMemo(() => localDateString(new Date()), []);
  const [baseline, setBaseline] = useState<BaselineStatus | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [todayRoutine, setTodayRoutine] = useState<RoutineDayResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [coachLogs, setCoachLogs] = useState<CoachLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightMemo, setWeightMemo] = useState('');
  const [error, setError] = useState('');

  const fromDate = useMemo(() => offsetDate(today, -30), [today]);
  const toDate = useMemo(() => offsetDate(today, 14), [today]);
  const canUseRoutine = baselineComplete(baseline);
  const hasProfileDetails = Boolean(activeProfile && activeProfile.weight_kg > 0 && activeProfile.height_cm > 0);
  const routineEvidence = evidenceFromProgress(progress, routine);
  const historySummary = historyFromProgress(progress, routine);
  const weeklyAdjustment = adjustmentFromProgress(progress, routine);
  const latestCoachingEvidence = coachingEvidence(coachLogs, lastResult);

  const loadDashboard = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    setError('');
    try {
      const dayRequest = getRoutineDay(activeProfile.id, today).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('404')) return null;
        throw err;
      });
      const [baselineData, calendarData, dayData, progressData, logsData] = await Promise.all([
        getBaselineStatus(activeProfile.id),
        getRoutineCalendar(activeProfile.id, fromDate, toDate),
        dayRequest,
        getProgress(activeProfile.id, 30),
        getCoachLogs(activeProfile.id, 100),
      ]);

      const complete = baselineComplete(baselineData);
      setBaseline(baselineData);
      setBaselineReady(complete);
      setCalendar(calendarData);
      setTodayRoutine(dayData);
      setProgress(progressData);
      setCoachLogs(logsData.logs ?? []);
      setRoutine(dayData ? routineFromDay(dayData) : null);

      const latestMetric = progressData.body_metrics[progressData.body_metrics.length - 1];
      const latestWeight = latestMetric?.weight_kg ?? activeProfile.weight_kg;
      if (latestWeight > 0) setWeightInput((prev) => prev || String(latestWeight));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, fromDate, setBaselineReady, setRoutine, today, toDate]);

  useEffect(() => {
    if (!activeProfile) {
      navigate('/');
      return;
    }
    void loadDashboard();
  }, [activeProfile, loadDashboard, navigate]);

  async function handleGenerateRoutine() {
    if (!activeProfile) return;
    if (!hasProfileDetails) {
      navigate('/baseline-check');
      return;
    }
    if (!canUseRoutine) {
      navigate('/baseline-setup');
      return;
    }
    setRoutineLoading(true);
    setError('');
    try {
      const generated = await getRoutine(activeProfile, true);
      setRoutine(generated);
      await loadDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setRoutineLoading(false);
    }
  }

  async function handleSaveWeight(event: FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;
    const weight = Number(weightInput);
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('몸무게를 숫자로 입력해 주세요.');
      return;
    }
    setWeightSaving(true);
    setError('');
    try {
      await saveBodyMetric(activeProfile.id, today, weight, weightMemo);
      setWeightMemo('');
      await loadDashboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setWeightSaving(false);
    }
  }

  function handleStart() {
    if (!todayRoutine) return;
    setRoutine(routineFromDay(todayRoutine));
    setCurrentExerciseIndex(0);
    navigate('/camera');
  }

  if (!activeProfile) return null;

  if (loading) {
    return (
      <div className="mode-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>운동 홈을 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  const todayItems = todayRoutine ? routineItemsFromExercises(todayRoutine.exercises) : [];
  const summary = progress?.workout_summary ?? {};
  const recentMetrics = progress?.body_metrics ?? [];
  const scheduleDays = calendar?.days ?? [];
  const historyEntries = Object.entries(historySummary).slice(0, 6);

  return (
    <div className="mode-page">
      <div className="mode-header">
        <button className="back-btn btn-outline" onClick={() => navigate('/')}>프로필</button>
        <div className="mode-title-block">
          <h2 className="mode-title">{activeProfile.name} 운동 홈</h2>
          <div className="mode-meta">
            <span className="badge source-badge">PC3 연결</span>
            <span className={`badge ${canUseRoutine ? 'ready-badge' : 'need-badge'}`}>
              {canUseRoutine ? '베이스라인 완료' : '베이스라인 필요'}
            </span>
            <span className="meta-text">{fromDate} ~ {toDate}</span>
          </div>
        </div>
        <button className="btn-outline" onClick={() => void loadDashboard()}>새로고침</button>
      </div>

      {error && <div className="error-notice">{error}</div>}

      <div className="home-scroll">
        <section className="home-panel today-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">오늘</p>
              <h3>{todayRoutine?.message || todayRoutine?.focus || '오늘 루틴 없음'}</h3>
            </div>
            {todayRoutine && <span className="meta-text">Day {todayRoutine.day_index}</span>}
          </div>

          {todayRoutine ? (
            <>
              <p className="panel-description">{todayRoutine.summary || todayRoutine.weekly_focus}</p>
              <div className="today-routine-list">
                {todayItems.map((item, index) => (
                  <div key={`${item.exercise_type}-${index}`} className="today-routine-item">
                    <span className="item-index">{index + 1}</span>
                    <div>
                      <div className="item-name">{exKo(item.exercise_type)}</div>
                      <div className="item-detail">
                        {item.sets}세트 · {item.reps ? `${item.reps}회` : `${item.duration_sec ?? 0}초`}
                        {' · '}휴식 {item.rest_sec}초
                      </div>
                      {item.focus && <div className="item-focus">{item.focus}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-primary start-btn" onClick={handleStart}>운동 시작</button>
            </>
          ) : (
            <div className="empty-state">
              <p>
                {canUseRoutine
                  ? '저장된 오늘 루틴이 없습니다. PC3를 통해 새 주간 루틴을 생성하세요.'
                  : '루틴을 만들기 전에 프로필 상세정보와 베이스라인 촬영이 필요합니다.'}
              </p>
              <button
                className="btn-primary"
                onClick={handleGenerateRoutine}
                disabled={routineLoading}
              >
                {canUseRoutine ? (routineLoading ? '생성 중...' : '새 주간 루틴 생성') : '프로필/베이스라인 설정'}
              </button>
            </div>
          )}
        </section>

        <section className="home-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">스케줄</p>
              <h3>기간 달력</h3>
            </div>
            <span className="meta-text">{scheduleDays.length}일</span>
          </div>
          <div className="calendar-strip">
            {scheduleDays.map((day) => (
              <div
                key={day.date}
                className={`calendar-day ${day.date === today ? 'today' : ''} ${day.completed ? 'done' : ''} ${day.skipped ? 'skipped' : ''}`}
              >
                <div className="calendar-date">{day.date.slice(5)}</div>
                <div className="calendar-focus">{day.focus || '-'}</div>
                <div className="calendar-meta">
                  {day.routine_day_id ? `#${day.routine_day_id}` : '루틴 없음'}
                  {workoutCountText(day) && ` · ${workoutCountText(day)}`}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="home-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">몸무게</p>
              <h3>최근 변화 {formatWeightDelta(progress?.weight_delta_kg ?? null)}</h3>
            </div>
          </div>
          <form className="weight-form" onSubmit={handleSaveWeight}>
            <input
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              inputMode="decimal"
              placeholder="kg"
            />
            <input
              value={weightMemo}
              onChange={(event) => setWeightMemo(event.target.value)}
              placeholder="메모"
            />
            <button className="btn-primary" disabled={weightSaving}>
              {weightSaving ? '저장 중...' : '저장'}
            </button>
          </form>
          <div className="metric-list">
            {recentMetrics.slice(-5).reverse().map((metric) => (
              <div key={metric.id} className="metric-row">
                <span>{metric.measured_date}</span>
                <strong>{metric.weight_kg}kg</strong>
                <span>{metric.memo || ''}</span>
              </div>
            ))}
            {recentMetrics.length === 0 && <p className="muted-text">아직 몸무게 기록이 없습니다.</p>}
          </div>
        </section>

        <section className="home-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">결과</p>
              <h3>운동 요약</h3>
            </div>
          </div>
          <div className="stats-grid">
            <div><span>세션</span><strong>{summary.session_count ?? 0}</strong></div>
            <div><span>운동</span><strong>{summary.workout_count ?? 0}</strong></div>
            <div><span>스킵</span><strong>{summary.skipped_count ?? 0}</strong></div>
            <div><span>총 횟수</span><strong>{summary.total_reps ?? 0}</strong></div>
            <div><span>총 시간</span><strong>{formatDuration(summary.total_duration_sec)}</strong></div>
            <div><span>안정성</span><strong>{summary.avg_stability_score != null ? `${Math.round(summary.avg_stability_score * 100)}%` : '-'}</strong></div>
          </div>
          <div className="exercise-counts">
            {Object.entries(summary.by_exercise ?? {}).map(([exercise, count]) => (
              <span key={exercise}>{exKo(exercise)} {count}</span>
            ))}
          </div>
        </section>

        <section className="home-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">기록</p>
              <h3>최근 코칭 전체</h3>
            </div>
            <span className="meta-text">{coachLogs.length}개</span>
          </div>
          <div className="coach-log-list">
            {coachLogs.map((log) => (
              <article key={log.id ?? log.request_id} className="coach-log-row">
                <div className="coach-log-head">
                  <strong>{coachingTitle(log)}</strong>
                  <span>{log.created_at?.slice(0, 10) ?? ''}</span>
                </div>
                {coachingLines(log).length > 0 && (
                  <ul>
                    {coachingLines(log).map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
            {coachLogs.length === 0 && <p className="muted-text">아직 저장된 코칭이 없습니다.</p>}
          </div>
        </section>

        <section className="home-panel card">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">근거</p>
              <h3>루틴/코칭 근거</h3>
            </div>
          </div>
          {weeklyAdjustment && (
            <div className="adjustment-summary">
              <strong>{adjustmentLabel(weeklyAdjustment)}</strong>
              {weeklyAdjustment.reasons?.length > 0 && (
                <span>이유: {weeklyAdjustment.reasons.slice(0, 2).join(', ')}</span>
              )}
            </div>
          )}
          <div className="evidence-grid">
            <div>
              <h4>루틴 근거</h4>
              {routineEvidence.slice(0, 5).map((item, index) => {
                const formatted = formatEvidence(item);
                return (
                  <p key={index}>
                    <strong>{formatted.title}</strong>
                    {formatted.meta && <span>{formatted.meta}</span>}
                  </p>
                );
              })}
              {routineEvidence.length === 0 && <p className="muted-text">루틴 근거는 새 루틴 생성 후 표시됩니다.</p>}
            </div>
            <div>
              <h4>코칭 근거</h4>
              {latestCoachingEvidence.slice(0, 5).map((item, index) => {
                const formatted = formatEvidence(item);
                return (
                  <p key={index}>
                    <strong>{formatted.title}</strong>
                    {formatted.meta && <span>{formatted.meta}</span>}
                  </p>
                );
              })}
              {latestCoachingEvidence.length === 0 && <p className="muted-text">코칭 근거는 운동 종료 후 표시됩니다.</p>}
            </div>
          </div>
          {historyEntries.length > 0 && (
            <div className="history-summary">
              {historyEntries.map(([key, value]) => (
                <span key={key}>{key}: {String(value)}</span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
