import { useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import AppShell from "../components/AppShell";
import { getProgress, getSessionResult } from "../services/api";
import { useAppState } from "../state/AppContext";
import type { EvidenceItem, ProgressResponse, SessionFinalResponse, WeeklyRoutineExercise } from "../types/domain";
import { formatCategoryLabel, formatExerciseName, formatMeasurementQuality, formatPostureError, todayIso } from "../utils/format";
import {
  composeImprovementLines,
  composePositiveLine,
  resolveSafetyLevel,
} from "../utils/coachingCopy";

type ExerciseSummary = {
  index: number;
  exercise: WeeklyRoutineExercise | null;
  result: SessionFinalResponse | null;
  label: string;
  status: string;
  hasResult: boolean;
  skipped: boolean;
  count: number;
  leftCount: number | null;
  rightCount: number | null;
  stability: number | null;
  measurementQuality: string;
  postureErrors: string[];
  warnings: string[];
  displayLines: string[];
  evidence: EvidenceItem[];
  message: string;
};

function featureValue(features: Record<string, unknown> | undefined, key: string): unknown {
  const exercise = features?.exercise;
  if (exercise && typeof exercise === "object" && key in exercise) {
    return (exercise as Record<string, unknown>)[key];
  }
  return features?.[key];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter((item) => item.trim().length > 0);
}

function cleanDisplayText(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanLines(values: string[]): string[] {
  return values
    .map((value) => cleanDisplayText(value, ""))
    .filter((value) => value.length > 0);
}

function scoreLabel(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function countLabel(value: number): string {
  return value > 0 ? `${value}회` : "-";
}

function balanceLabel(leftCount: number | null, rightCount: number | null): string {
  if (leftCount === null || rightCount === null) {
    return "좌우 기록 없음";
  }
  const diff = Math.abs(leftCount - rightCount);
  if (diff <= 1) {
    return "좌우 균형 좋음";
  }
  if (diff <= 3) {
    return "조금 차이 있음";
  }
  return "좌우 차이 주의";
}

function detailText(item: EvidenceItem): string {
  return item.summary ?? item.text ?? item.title ?? item.source_title ?? "함께 전달된 참고 근거입니다.";
}

function detailLabel(item: EvidenceItem): string {
  const category = formatCategoryLabel(item.category ?? item.category_label);
  const exercise = formatExerciseName(item.exercise ?? item.exercise_label);
  return [exercise, category].filter(Boolean).join(" · ") || "코칭 근거";
}

function resolveExerciseLabel(exercise: WeeklyRoutineExercise | null, result: SessionFinalResponse | null): string {
  const resultType = String(featureValue(result?.features, "type") ?? "");
  return formatExerciseName(exercise?.exercise ?? resultType) || `운동 ${result ? "" : "결과"}`.trim();
}

function summarizeExercise(exercise: WeeklyRoutineExercise | null, result: SessionFinalResponse | null, index: number): ExerciseSummary {
  const skipped = result?.status === "skipped";
  const count = toNumber(featureValue(result?.features, "count")) ?? 0;
  const leftCount = toNumber(featureValue(result?.features, "count_left"));
  const rightCount = toNumber(featureValue(result?.features, "count_right"));
  const stability = toNumber(featureValue(result?.features, "stability_score"));
  const measurementQuality = result
    ? formatMeasurementQuality(String(featureValue(result.features, "measurement_quality") ?? ""))
    : "결과 없음";
  const postureErrors = toStringArray(featureValue(result?.features, "posture_errors"));
  const warnings = result?.coaching?.warnings ?? [];
  const displayLines = cleanLines(result?.coaching?.pc2_payload?.display_lines ?? []);

  return {
    index,
    exercise,
    result,
    label: resolveExerciseLabel(exercise, result),
    status: result ? (skipped ? "건너뜀" : "완료") : "결과 없음",
    hasResult: Boolean(result),
    skipped,
    count,
    leftCount,
    rightCount,
    stability,
    measurementQuality,
    postureErrors,
    warnings,
    displayLines,
    evidence: result?.coaching?.pc2_payload?.evidence ?? [],
    message: cleanDisplayText(
      result?.coaching?.mirror_message ?? result?.coaching?.summary,
      result ? "이 동작의 기록을 정리했어요." : "아직 저장된 결과가 없습니다.",
    ),
  };
}

function routineStatusLabel(completedCount: number, totalCount: number, skippedCount: number): string {
  if (totalCount === 0) {
    return "분석 대기";
  }
  if (skippedCount === totalCount) {
    return "전체 건너뜀";
  }
  if (skippedCount > 0) {
    return `${completedCount}개 완료 · ${skippedCount}개 건너뜀`;
  }
  if (completedCount === totalCount) {
    return `${totalCount}개 동작 완료`;
  }
  return `${completedCount}/${totalCount}개 동작 완료`;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export default function ResultPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const result = app.lastResult;
  const profile = app.activeProfile;
  const workoutRun = app.workoutRun;
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [storedResult, setStoredResult] = useState<SessionFinalResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const displayResult = storedResult ?? result;
  const resultDate = app.selectedDay?.scheduledDate ?? workoutRun?.day.scheduledDate ?? todayIso();

  const sessionResults = useMemo(() => {
    const currentResults = workoutRun?.results.length ? [...workoutRun.results] : displayResult ? [displayResult] : [];
    if (!storedResult?.session_id) {
      return currentResults;
    }
    const matchIndex = currentResults.findIndex((item) => item.session_id === storedResult.session_id);
    if (matchIndex >= 0) {
      currentResults[matchIndex] = storedResult;
      return currentResults;
    }
    return currentResults;
  }, [displayResult, storedResult, workoutRun?.results]);

  const exerciseSummaries = useMemo(() => {
    const exercises = workoutRun?.day.exercises ?? [];
    if (exercises.length) {
      return exercises.map((exercise, index) => summarizeExercise(exercise, sessionResults[index] ?? null, index));
    }
    if (displayResult) {
      return [summarizeExercise(null, displayResult, 0)];
    }
    return [];
  }, [displayResult, sessionResults, workoutRun?.day.exercises]);

  const completedSummaries = exerciseSummaries.filter((item) => item.hasResult && !item.skipped);
  const skippedCount = exerciseSummaries.filter((item) => item.skipped).length;
  const completedCount = completedSummaries.length;
  const totalExerciseCount = exerciseSummaries.length;
  const totalReps = exerciseSummaries.reduce((sum, item) => sum + item.count, 0);
  const averageStability = average(exerciseSummaries.map((item) => item.stability));
  const allPostureErrors = exerciseSummaries.flatMap((item) => item.postureErrors);
  const allWarnings = exerciseSummaries.flatMap((item) => item.warnings);
  const allDisplayLines = exerciseSummaries.flatMap((item) => item.displayLines);
  const allEvidence = exerciseSummaries.flatMap((item) => item.evidence);
  const attentionCount = allPostureErrors.length + allWarnings.length;
  const representativeSummary = [...exerciseSummaries].reverse().find((item) => item.hasResult) ?? exerciseSummaries[0] ?? null;
  const representativeQuality = representativeSummary?.measurementQuality ?? "확인 필요";
  const representativeExerciseLabel = representativeSummary?.label ?? "오늘 루틴";
  const savedLabel = storedResult ? "저장 결과 확인 완료" : result?.session_id ? "이번 세션 기록" : "로컬 기록";
  const routineStatus = routineStatusLabel(completedCount, totalExerciseCount, skippedCount);
  const routineTitle = workoutRun?.routine.title ?? app.selectedRoutine?.title ?? "오늘 루틴";
  const routineFocus = workoutRun?.day.focus || workoutRun?.day.weeklyFocus || app.selectedRoutine?.description || "오늘 루틴의 진행 기록을 기준으로 정리했어요.";
  const completedLabels = completedSummaries.map((item) => item.label).filter(Boolean).join(" · ");
  const heroMessage = cleanDisplayText(
    displayResult?.coaching?.mirror_message ?? displayResult?.coaching?.summary,
    "오늘 루틴 기록을 정리했어요. 아래에서 운동별 결과와 다음에 볼 점을 확인하세요.",
  );

  const safetyLevel = resolveSafetyLevel({
    warnings: allWarnings,
    stability: averageStability,
    measurementQuality: representativeQuality,
  });
  const positiveMessage = composePositiveLine(
    safetyLevel,
    representativeExerciseLabel,
    averageStability === null ? null : Math.round(averageStability * 100),
  );
  const improvementLines = composeImprovementLines(allDisplayLines, allWarnings, safetyLevel);

  useEffect(() => {
    if (!profile) {
      return;
    }
    let alive = true;
    void getProgress(profile.id, 30).then((data) => alive && setProgress(data)).catch(() => alive && setProgress(null));
    return () => {
      alive = false;
    };
  }, [profile, result?.session_id]);

  useEffect(() => {
    if (!result?.session_id) {
      return;
    }
    let alive = true;
    void getSessionResult(result.session_id)
      .then((stored) => {
        if (alive) {
          setStoredResult(stored);
        }
      })
      .catch(() => {
        // 저장 결과 재조회에 실패하면 직전 메모리 결과를 그대로 사용한다.
      });
    return () => {
      alive = false;
    };
  }, [result?.session_id]);

  const previousWorkout = useMemo(() => {
    const workouts = progress?.recentWorkouts ?? [];
    const exerciseType = representativeSummary?.exercise?.exercise ?? String(featureValue(representativeSummary?.result?.features, "type") ?? "");
    return workouts.find((item) => {
      if (item.sessionId && result?.session_id && item.sessionId === result.session_id) {
        return false;
      }
      if (item.status === "skipped") {
        return false;
      }
      return typeof item.exerciseType === "string" && item.exerciseType === exerciseType;
    }) ?? null;
  }, [progress?.recentWorkouts, representativeSummary, result?.session_id]);

  const previousStability = previousWorkout?.stabilityScore ?? null;
  const stabilityDeltaPercent = averageStability != null && previousStability != null ? Math.round((averageStability - previousStability) * 100) : null;
  const previousPostureErrorCount = previousWorkout?.postureErrors?.length ?? null;
  const postureErrorDelta = previousPostureErrorCount == null ? null : allPostureErrors.length - previousPostureErrorCount;

  if (!result) {
    return (
      <AppShell title="결과" subtitle="표시할 결과가 없습니다." backFallbackTo="/mode">
        <button type="button" className="button button--primary" onClick={() => navigate("/mode", { replace: true })}>
          루틴으로
        </button>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="결과"
      step="6단계"
      subtitle="코칭과 핵심 기록을 먼저 확인하세요."
      backFallbackTo="/mode"
      footer={
        <div className="footer-actions">
          <button type="button" className="button button--ghost" onClick={() => navigate("/mode", { replace: true })}>
            루틴으로
          </button>
          {result.session_id ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => navigate(`/history?date=${encodeURIComponent(resultDate)}&session_id=${encodeURIComponent(result.session_id)}`, { replace: true })}
            >
              기록에서 보기
            </button>
          ) : null}
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              app.resetWorkout();
              app.setActiveProfileId(null);
              navigate("/profile-select", { replace: true });
            }}
          >
            프로필로
          </button>
        </div>
      }
    >
      <div className="result-grid result-grid--coach">
        <section className="panel result-hero result-hero--coach">
          <div className="result-hero-copy">
            <span className="eyebrow">결과 요약</span>
            <h2>오늘 루틴 결과</h2>
            <p>{heroMessage}</p>
            <div className="result-hero-meta">
              <span>{routineStatus}</span>
              <span>{savedLabel}</span>
            </div>
          </div>
          <div className="result-kpi-dashboard" aria-label="오늘 루틴 핵심 기록">
            <div>
              <span>완료 동작</span>
              <strong>{completedCount}/{totalExerciseCount || 1}</strong>
            </div>
            <div>
              <span>총 반복</span>
              <strong>{countLabel(totalReps)}</strong>
            </div>
            <div>
              <span>평균 안정도</span>
              <strong>{scoreLabel(averageStability)}</strong>
            </div>
            <div>
              <span>주의 항목</span>
              <strong>{attentionCount}</strong>
            </div>
          </div>
        </section>

        <section className="panel result-summary-card">
          <div>
            <span className="eyebrow">오늘의 효과</span>
            <h3>{routineTitle}</h3>
            <p>{routineFocus}</p>
            <p>
              {completedLabels
                ? `${completedLabels} 기록을 기준으로 반복 수와 안정도를 다음 루틴 조정에 참고할 수 있어요.`
                : "저장된 운동 결과가 생기면 이곳에서 루틴의 흐름을 한 번에 볼 수 있어요."}
            </p>
          </div>
          <div>
            <span className="eyebrow">다음에 볼 점</span>
            <h3>{positiveMessage}</h3>
            <ul className="result-action-list">
              {improvementLines.slice(0, 3).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
            </ul>
          </div>
        </section>

        <section className="panel result-exercise-section">
          <div className="panel-heading-row">
            <div>
              <span className="eyebrow">운동별 결과</span>
              <h3 className="result-panel-title">루틴 안의 동작을 각각 확인해요</h3>
            </div>
            <strong className="result-section-count">{totalExerciseCount}개 동작</strong>
          </div>
          <div className="result-exercise-grid" data-count={exerciseSummaries.length}>
            {exerciseSummaries.map((summary) => (
              <article key={`${summary.label}-${summary.index}`} className={`result-exercise-card ${summary.skipped ? "is-skipped" : ""} ${summary.hasResult ? "" : "is-empty"}`.trim()}>
                <div className="result-exercise-card__head">
                  <span>{summary.index + 1}</span>
                  <div>
                    <strong>{summary.label}</strong>
                    <em>{summary.status}</em>
                  </div>
                </div>
                <div className="result-exercise-metrics">
                  <div><span>횟수</span><strong>{countLabel(summary.count)}</strong></div>
                  <div><span>안정도</span><strong>{scoreLabel(summary.stability)}</strong></div>
                  <div><span>측정</span><strong>{summary.measurementQuality}</strong></div>
                </div>
                <p>{summary.message}</p>
                <div className="result-exercise-notes">
                  <span>{balanceLabel(summary.leftCount, summary.rightCount)}</span>
                  {summary.postureErrors.slice(0, 2).map((item, index) => <span key={`${item}-${index}`}>{formatPostureError(item)}</span>)}
                  {!summary.postureErrors.length && summary.hasResult ? <span>큰 자세 오류 없음</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel result-detail-card">
          <div className="result-detail-card__head">
            <div>
              <span className="eyebrow">상세 분석</span>
              <h3 className="result-panel-title">코칭 분석 리포트</h3>
            </div>
            <button type="button" className="button button--ghost" onClick={() => setDetailsOpen((value) => !value)}>
              {detailsOpen ? "상세 분석 접기" : "상세 분석 보기"}
            </button>
          </div>
          {detailsOpen ? (
            <div className="result-detail-grid">
              <article>
                <h3>주의 항목</h3>
                {allPostureErrors.length ? (
                  <ul>
                    {allPostureErrors.slice(0, 6).map((item, index) => <li key={`${item}-${index}`}>{formatPostureError(item)}</li>)}
                  </ul>
                ) : (
                  <p>감지된 자세 오류가 없습니다.</p>
                )}
              </article>
              <article>
                <h3>이전 기록 비교</h3>
                <p>안정도 변화 {stabilityDeltaPercent == null ? "비교 기록 없음" : `${stabilityDeltaPercent > 0 ? "+" : ""}${stabilityDeltaPercent}%`}</p>
                <p>자세 오류 변화 {postureErrorDelta == null ? "비교 기록 없음" : `${postureErrorDelta > 0 ? "+" : ""}${postureErrorDelta}개`}</p>
              </article>
              <article className="result-detail-card__wide">
                <h3>분석 근거</h3>
                {allEvidence.length ? (
                  <div className="result-evidence-list">
                    {allEvidence.slice(0, 4).map((item, index) => (
                      <div key={`${item.id ?? item.source_id ?? index}`}>
                        <strong>{detailLabel(item)}</strong>
                        <p>{detailText(item)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>이번 결과에 표시할 근거가 없습니다.</p>
                )}
              </article>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
