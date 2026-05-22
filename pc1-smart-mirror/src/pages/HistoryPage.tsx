import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, type NavigateFunction } from "react-router-dom";

import AppShell from "../components/AppShell";
import { getCoachLogs, getRoutineCalendar, getSessionResult } from "../services/api";
import { dayNotePreview, readDayNote, saveDayNote } from "../services/dayNotes";
import { useAppState } from "../state/AppContext";
import type {
  CoachLog,
  RoutineCalendar,
  RoutineCalendarDay,
  SessionFinalResponse,
  WorkoutResult,
} from "../types/domain";
import { formatExerciseName, friendlyError, monthEndIso, monthStartIso, offsetDate, shortDate, todayIso } from "../utils/format";

type SessionRecordGroup = {
  key: string;
  sessionId: string | null;
  workouts: WorkoutResult[];
  logs: CoachLog[];
  latestAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function featureValue(features: Record<string, unknown> | undefined, key: string): unknown {
  const exercise = asRecord(features?.exercise);
  if (exercise && key in exercise) {
    return exercise[key];
  }
  return features?.[key];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function cleanDisplayText(value: unknown): string {
  return String(value ?? "")
    .replace(/low_quality/g, "측정 품질 낮음")
    .replace(/pc2_ready/g, "측정 완료")
    .replace(/\bpost workout\b/gi, "운동 후 피드백")
    .replace(/\bcommon error\b/gi, "흔한 실수")
    .replace(/\bform basics\b/gi, "기본 자세")
    .replace(/\bprogression\b/gi, "강도 조절")
    .replace(/部/g, "쪽")
    .replace(/끰/g, "쪽")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueCleanStrings(values: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const cleaned = cleanDisplayText(value);
    if (!cleaned || seen.has(cleaned)) {
      return;
    }
    seen.add(cleaned);
    result.push(cleaned);
  });
  return result.slice(0, limit);
}

function coachingCardTitle(line: string, index: number): string {
  if (/완료|마쳤|끝냈/.test(line)) {
    return "완료 기록";
  }
  if (/자세|균형|안정/.test(line)) {
    return "자세 포인트";
  }
  if (/호흡|리듬|천천히/.test(line)) {
    return "움직임 리듬";
  }
  if (/다음|횟수|강도|늘려/.test(line)) {
    return "다음 운동";
  }
  return index === 0 ? "운동 요약" : "코칭 메모";
}

function dateTimeValue(value?: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}

function latestDate(...values: Array<string | null | undefined>): string | null {
  return values.filter(Boolean).sort((left, right) => dateTimeValue(right) - dateTimeValue(left))[0] ?? null;
}

function workoutResultRecord(workout: WorkoutResult): Record<string, unknown> | null {
  return asRecord(workout.result);
}

function fallbackDisplayLines(workout: WorkoutResult): string[] {
  const result = workoutResultRecord(workout);
  const pc2Payload = asRecord(result?.pc2_payload);
  return arrayOfStrings(pc2Payload?.display_lines);
}

function logDisplayLines(log: CoachLog): string[] {
  return arrayOfStrings(log.pc2Output?.display_lines ?? log.finalResponse?.pc2_payload?.display_lines);
}

function coachTitle(log: CoachLog): string {
  return cleanDisplayText(log.finalResponse?.summary ?? log.finalResponse?.mirror_message ?? log.pc2Output?.message ?? log.pc2Output?.summary ?? "코칭 기록");
}

function calendarStatus(day?: RoutineCalendarDay | null): string {
  if (!day) {
    return "기록 없음";
  }
  if (day.completed) {
    return "완료";
  }
  if (day.skipped) {
    return "건너뜀";
  }
  if (day.routineId) {
    return "운동 예정";
  }
  return "기록 없음";
}

function formatStatus(value?: string | null): string {
  const status = String(value ?? "").trim();
  const labels: Record<string, string> = {
    completed: "완료",
    skipped: "건너뜀",
    running: "진행 중",
    started: "시작됨",
    failed: "실패",
  };
  return labels[status] ?? (status || "-");
}

function formatQuality(value?: unknown): string {
  const quality = String(value ?? "").trim();
  const labels: Record<string, string> = {
    pc2_ready: "측정 완료",
    ready: "측정 완료",
    good: "좋음",
    low_quality: "측정 품질 낮음",
    low_confidence: "인식 낮음",
    no_pose: "자세 미인식",
  };
  return labels[quality] ?? (quality || "기록 없음");
}

function scoreLabel(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

function addGroup(map: Map<string, SessionRecordGroup>, key: string, sessionId: string | null, latestAt?: string | null): SessionRecordGroup {
  const existing = map.get(key);
  if (existing) {
    existing.latestAt = latestDate(existing.latestAt, latestAt);
    return existing;
  }
  const group: SessionRecordGroup = { key, sessionId, workouts: [], logs: [], latestAt: latestAt ?? null };
  map.set(key, group);
  return group;
}

function groupSessionRecords(workouts: WorkoutResult[], logs: CoachLog[], focusedSessionId: string | null): SessionRecordGroup[] {
  const groups = new Map<string, SessionRecordGroup>();

  workouts.forEach((workout, index) => {
    const sessionId = workout.sessionId ?? null;
    const key = sessionId ? `session:${sessionId}` : `workout:${workout.id ?? index}`;
    addGroup(groups, key, sessionId, workout.createdAt).workouts.push(workout);
  });

  logs.forEach((log, index) => {
    const sessionId = log.sessionId ?? null;
    const key = sessionId ? `session:${sessionId}` : `coach:${log.id ?? log.requestId ?? index}`;
    addGroup(groups, key, sessionId, log.createdAt).logs.push(log);
  });

  if (focusedSessionId && !groups.has(`session:${focusedSessionId}`)) {
    addGroup(groups, `session:${focusedSessionId}`, focusedSessionId);
  }

  return Array.from(groups.values()).sort((left, right) => dateTimeValue(right.latestAt) - dateTimeValue(left.latestAt));
}

function groupExerciseTitle(group: SessionRecordGroup, session?: SessionFinalResponse): string {
  const exerciseTypes = Array.from(new Set(group.workouts.map((workout) => formatExerciseName(workout.exerciseType)).filter(Boolean)));
  if (exerciseTypes.length > 1) {
    return `${exerciseTypes[0]} 외 ${exerciseTypes.length - 1}개 운동`;
  }
  if (exerciseTypes[0]) {
    return exerciseTypes[0];
  }
  const sessionType = formatExerciseName(String(featureValue(session?.features, "type") ?? ""));
  return sessionType || "세션 기록";
}

function groupCount(group: SessionRecordGroup, session?: SessionFinalResponse): number {
  const sessionCount = Number(featureValue(session?.features, "count"));
  if (Number.isFinite(sessionCount) && sessionCount > 0) {
    return sessionCount;
  }
  return group.workouts.reduce((sum, workout) => sum + Number(workout.completedReps ?? 0), 0);
}

function groupStability(group: SessionRecordGroup, session?: SessionFinalResponse): string {
  const value = groupStabilityValue(group, session);
  return value === null ? "-" : scoreLabel(value);
}

function groupStabilityValue(group: SessionRecordGroup, session?: SessionFinalResponse): number | null {
  const sessionScore = featureValue(session?.features, "stability_score");
  if (typeof sessionScore === "number") {
    return sessionScore;
  }
  const scores = group.workouts.map((workout) => workout.stabilityScore).filter((value): value is number => typeof value === "number");
  if (!scores.length) {
    return null;
  }
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function groupQuality(group: SessionRecordGroup, session?: SessionFinalResponse): string {
  return formatQuality(featureValue(session?.features, "measurement_quality") ?? group.workouts.find((workout) => workout.measurementQuality)?.measurementQuality);
}

function sessionDisplayLines(group: SessionRecordGroup, session?: SessionFinalResponse, representativeLog?: CoachLog): string[] {
  if (session?.coaching?.pc2_payload?.display_lines?.length) {
    return session.coaching.pc2_payload.display_lines;
  }
  const workoutLines = group.workouts.flatMap(fallbackDisplayLines);
  if (workoutLines.length) {
    return workoutLines;
  }
  return representativeLog ? logDisplayLines(representativeLog) : [];
}

export default function HistoryPage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const profile = app.activeProfile;
  const location = useLocation();
  const today = useMemo(todayIso, []);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryDate = params.get("date") || today;
  const focusedSessionId = params.get("session_id");

  const [calendar, setCalendar] = useState<RoutineCalendar | null>(null);
  const [coachLogs, setCoachLogs] = useState<CoachLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(queryDate);
  const [sessionResults, setSessionResults] = useState<Record<string, SessionFinalResponse>>({});
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [expandedCoachGroups, setExpandedCoachGroups] = useState<Record<string, boolean>>({});
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [dayMemo, setDayMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (anchorDate: string) => {
    if (!profile) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [calendarData, logsData] = await Promise.all([
        getRoutineCalendar(profile.id, monthStartIso(anchorDate), monthEndIso(anchorDate)),
        getCoachLogs(profile.id, 100),
      ]);
      setCalendar(calendarData);
      setCoachLogs(logsData);
    } catch (caught) {
      setError(friendlyError(caught, "저장된 기록을 불러오지 못했습니다. 다시 시도해주세요."));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    setSelectedDate(queryDate);
    setShowSessionDetails(false);
  }, [queryDate]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setDayMemo(readDayNote(profile.id, selectedDate));
  }, [profile, selectedDate]);

  useEffect(() => {
    if (!profile) {
      navigate("/profile-select", { replace: true });
      return;
    }
    void loadHistory(selectedDate);
  }, [loadHistory, navigate, profile, selectedDate]);

  const selectedDay = calendar?.days.find((day) => day.date === selectedDate) ?? null;
  const selectedWorkouts = selectedDay?.workoutResults ?? [];
  const selectedCoachLogs = useMemo(() => {
    const workoutSessionIds = new Set(selectedWorkouts.map((workout) => workout.sessionId).filter((value): value is string => Boolean(value)));
    const coachIds = new Set((selectedDay?.coachLogIds ?? []).map(String));

    return coachLogs.filter((log) => {
      if (coachIds.size && log.id !== undefined && coachIds.has(String(log.id))) {
        return true;
      }
      if (log.sessionId && workoutSessionIds.has(log.sessionId)) {
        return true;
      }
      if (focusedSessionId && log.sessionId === focusedSessionId) {
        return true;
      }
      return log.createdAt?.slice(0, 10) === selectedDate;
    });
  }, [coachLogs, focusedSessionId, selectedDate, selectedDay?.coachLogIds, selectedWorkouts]);

  const sessionGroups = useMemo(
    () => groupSessionRecords(selectedWorkouts, selectedCoachLogs, focusedSessionId),
    [focusedSessionId, selectedCoachLogs, selectedWorkouts],
  );

  const sessionIds = useMemo(
    () => sessionGroups.map((group) => group.sessionId).filter((sessionId): sessionId is string => Boolean(sessionId)),
    [sessionGroups],
  );

  const dayDigest = useMemo(() => {
    const groupsWithSession = sessionGroups.map((group) => {
      const session = group.sessionId ? sessionResults[group.sessionId] : undefined;
      const sortedLogs = [...group.logs].sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt));
      const representativeLog = sortedLogs[0];
      return { group, session, representativeLog };
    });
    const totalReps = groupsWithSession.reduce((sum, item) => sum + groupCount(item.group, item.session), 0);
    const stabilityValues = groupsWithSession
      .map((item) => groupStabilityValue(item.group, item.session))
      .filter((value): value is number => typeof value === "number");
    const avgStability = stabilityValues.length
      ? scoreLabel(stabilityValues.reduce((sum, value) => sum + value, 0) / stabilityValues.length)
      : "-";
    const exerciseTitles = uniqueCleanStrings(groupsWithSession.map((item) => groupExerciseTitle(item.group, item.session)), 3);
    const displayLines = uniqueCleanStrings(
      groupsWithSession.flatMap((item) => sessionDisplayLines(item.group, item.session, item.representativeLog)),
      5,
    );
    const qualities = groupsWithSession.map((item) => groupQuality(item.group, item.session));
    const hasLowQuality = qualities.some((quality) => quality.includes("낮") || quality.includes("미인식"));
    const qualityLabel = qualities.length ? (hasLowQuality ? "확인 필요" : "양호") : "기록 없음";
    const latestLog = [...selectedCoachLogs].sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt))[0];
    const fallbackLine = latestLog ? coachTitle(latestLog) : selectedDay?.focus ? `${selectedDay.focus} 루틴 기록입니다.` : "아직 보여줄 코칭 문장이 없습니다.";

    return {
      title: sessionGroups.length ? `${shortDate(selectedDate)} 운동을 한 번에 정리했어요` : `${shortDate(selectedDate)} 기록이 비어 있어요`,
      subtitle: exerciseTitles.length ? exerciseTitles.join(" · ") : selectedDay?.focus ?? "저장된 운동 없음",
      totalReps,
      avgStability,
      qualityLabel,
      displayLines: displayLines.length ? displayLines : [fallbackLine],
    };
  }, [selectedCoachLogs, selectedDate, selectedDay?.focus, sessionGroups, sessionResults]);

  useEffect(() => {
    let cancelled = false;
    sessionIds.forEach((sessionId) => {
      if (sessionResults[sessionId] || sessionErrors[sessionId]) {
        return;
      }
      void getSessionResult(sessionId)
        .then((result) => {
          if (!cancelled) {
            setSessionResults((current) => ({ ...current, [sessionId]: result }));
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setSessionErrors((current) => ({ ...current, [sessionId]: friendlyError(caught, "세션 결과를 다시 불러오지 못했습니다.") }));
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionErrors, sessionIds, sessionResults]);

  const goToDate = (date: string) => {
    navigate(`/history?date=${encodeURIComponent(date)}`, { replace: true });
  };

  const updateMemo = (value: string) => {
    if (!profile) {
      return;
    }
    const clipped = value.slice(0, 240);
    setDayMemo(clipped);
    saveDayNote(profile.id, selectedDate, clipped);
  };

  if (!profile) {
    return null;
  }

  return (
    <AppShell title="HISTORY" step="RECORD" backFallbackTo="/mode" className="history-shell">
      {error ? (
        <div className="inline-alert inline-alert--error">
          <span>{error}</span>
          <button type="button" onClick={() => void loadHistory(selectedDate)}>
            재시도
          </button>
        </div>
      ) : null}
      {loading ? <div className="inline-alert">저장 기록을 불러오는 중입니다.</div> : null}

      <div className="history-detail-grid">
        <section className="panel history-detail-hero">
          <div>
            <span className="eyebrow">DAY DETAIL</span>
            <h2>{shortDate(selectedDate)} 기록</h2>
            <p>{selectedDay?.focus ? `${selectedDay.focus} 루틴을 기준으로 저장된 기록입니다.` : "선택한 날짜에 저장된 운동 기록을 모아 보여줍니다."}</p>
          </div>
          <div className="history-day-actions">
            <button type="button" className="button button--ghost" onClick={() => navigate("/mode", { replace: true })}>
              루틴으로
            </button>
            <button type="button" className="button button--ghost" onClick={() => goToDate(offsetDate(selectedDate, -1))}>
              이전 날짜
            </button>
            <button type="button" className="button button--ghost" onClick={() => goToDate(offsetDate(selectedDate, 1))}>
              다음 날짜
            </button>
          </div>
        </section>

        <section className="panel history-summary-panel history-summary-panel--split">
          <div className="history-summary-main">
            <span className="eyebrow">SUMMARY</span>
            <h2>그날 요약</h2>
            <div className="history-kpi-grid">
              <div><span>상태</span><strong>{calendarStatus(selectedDay)}</strong></div>
              <div><span>세션</span><strong>{sessionGroups.length}</strong></div>
              <div><span>운동 결과</span><strong>{selectedWorkouts.length}</strong></div>
              <div><span>코칭</span><strong>{selectedCoachLogs.length}</strong></div>
            </div>
          </div>
          <div className="history-memo-pad">
            <div>
              <span className="eyebrow">MEMO</span>
              <strong>메모장</strong>
            </div>
            <textarea
              value={dayMemo}
              onChange={(event) => updateMemo(event.target.value)}
              maxLength={240}
              placeholder="오늘 느낀 점이나 다음에 볼 내용을 적어두세요."
            />
            <em>{dayNotePreview(dayMemo) ? `달력 표시: ${dayNotePreview(dayMemo)}` : "메모를 적으면 루틴 달력에도 짧게 보입니다."}</em>
          </div>
        </section>

        <section className="panel history-session-panel">
          <span className="eyebrow">SESSION RESULT</span>
          <h2>운동 결과와 코칭</h2>
          <article className="history-digest-card">
            <div className="history-digest-head">
              <div>
                <strong>{dayDigest.title}</strong>
                <span>{dayDigest.subtitle}</span>
              </div>
              {sessionGroups.length ? (
                <button type="button" className="button button--ghost" onClick={() => setShowSessionDetails((value) => !value)}>
                  {showSessionDetails ? "세션별 기록 접기" : `세션별 기록 보기 (${sessionGroups.length})`}
                </button>
              ) : null}
            </div>
            <div className="history-kpi-grid">
              <div><span>총 횟수</span><strong>{dayDigest.totalReps}</strong></div>
              <div><span>평균 안정도</span><strong>{dayDigest.avgStability}</strong></div>
              <div><span>측정 상태</span><strong>{dayDigest.qualityLabel}</strong></div>
              <div><span>코칭 수</span><strong>{selectedCoachLogs.length}</strong></div>
            </div>
            <div className="history-digest-copy">
              <strong>운동 요약</strong>
              <div className="history-coaching-cards">
                {dayDigest.displayLines.slice(0, 4).map((line, index) => (
                  <div key={`${line}-${index}`}>
                    <span>{coachingCardTitle(line, index)}</span>
                    <p>{line}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {showSessionDetails ? (
            <div className="history-session-list">
              {sessionGroups.length === 0 ? <p className="empty-copy">선택한 날짜의 운동 결과와 코칭 로그가 없습니다.</p> : null}
              {sessionGroups.map((group) => {
                const session = group.sessionId ? sessionResults[group.sessionId] : undefined;
                const sessionError = group.sessionId ? sessionErrors[group.sessionId] : null;
                const sortedLogs = [...group.logs].sort((left, right) => dateTimeValue(right.createdAt) - dateTimeValue(left.createdAt));
                const representativeLog = sortedLogs[0];
                const extraLogs = sortedLogs.slice(1);
                const displayLines = uniqueCleanStrings(sessionDisplayLines(group, session, representativeLog), 6);
                const summary = cleanDisplayText(session?.coaching?.summary ?? (representativeLog ? coachTitle(representativeLog) : "저장된 운동 결과입니다."));
                const isExpanded = Boolean(expandedCoachGroups[group.key]);

                return (
                  <article key={group.key} className={focusedSessionId === group.sessionId ? "is-focused" : ""}>
                    <div className="history-session-head">
                      <div>
                        <strong>{groupExerciseTitle(group, session)}</strong>
                        <span>{group.latestAt?.slice(0, 16).replace("T", " ") ?? selectedDate}</span>
                      </div>
                      <em>{group.sessionId ? (session ? "재조회 완료" : sessionError ?? "재조회 중") : "로컬 기록"}</em>
                    </div>

                    <div className="history-kpi-grid">
                      <div><span>횟수</span><strong>{groupCount(group, session)}</strong></div>
                      <div><span>안정도</span><strong>{groupStability(group, session)}</strong></div>
                      <div><span>측정 품질</span><strong>{groupQuality(group, session)}</strong></div>
                      <div><span>상태</span><strong>{formatStatus(group.workouts[0]?.status ?? session?.status)}</strong></div>
                    </div>

                    <p className="history-session-summary">{summary}</p>

                    {displayLines.length ? (
                      <ul className="history-line-list">
                        {displayLines.map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{line}</li>)}
                      </ul>
                    ) : null}

                    {extraLogs.length ? (
                      <div className="history-coach-more">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setExpandedCoachGroups((current) => ({ ...current, [group.key]: !isExpanded }))}
                        >
                          {isExpanded ? "코칭 접기" : `코칭 더 보기 (${extraLogs.length})`}
                        </button>
                        {isExpanded ? (
                          <div className="history-coach-more-list">
                            {extraLogs.map((log) => (
                              <div key={`${log.id ?? log.requestId ?? log.createdAt}`}>
                                <strong>{coachTitle(log)}</strong>
                                <span>{log.createdAt?.slice(0, 16).replace("T", " ") ?? ""}</span>
                                {logDisplayLines(log).length ? (
                                  <ul>
                                    {uniqueCleanStrings(logDisplayLines(log), 4).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
                                  </ul>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
