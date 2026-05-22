import { useCallback, useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";

import AppShell from "../components/AppShell";
import {
  generateRoutine,
  getBaselineStatus,
  getRoutineCalendar,
  getRoutineDay,
  profileNeedsBaseline,
  routineFromDay,
} from "../services/api";
import { dayNotePreview, readDayNotes } from "../services/dayNotes";
import { useAppState } from "../state/AppContext";
import type { RoutineCalendar, RoutineCalendarDay, RoutineDay, WeeklyRoutineExercise } from "../types/domain";
import {
  EXERCISE_LABELS,
  formatExerciseTarget,
  friendlyError,
  monthEndIso,
  monthStartIso,
  shortDate,
  todayIso,
} from "../utils/format";

type RoutineReasonCard = {
  label: string;
  title: string;
  body: string;
};

const TEXT_LIMITS = {
  calendar: 10,
  title: 22,
  reasonTitle: 18,
  reasonBody: 42,
};

const ROUTINE_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsquat\b/gi, "스쿼트"],
  [/\bknee[_\s-]?raise\b/gi, "니 레이즈"],
  [/\bjumping[_\s-]?jack\b/gi, "점핑잭"],
  [/\blunge\b/gi, "런지"],
  [/\bpush[_\s-]?up\b/gi, "푸시업"],
  [/\bposture\b/gi, "자세"],
  [/\bbalance\b/gi, "균형"],
  [/\bstability\b/gi, "안정성"],
  [/\brhythm\b/gi, "리듬"],
  [/\bstrength\b/gi, "근력"],
  [/\bcardio\b/gi, "심폐"],
  [/\bmobility\b/gi, "가동성"],
  [/\bform[_\s-]?basics\b/gi, "기본 자세"],
  [/\bcommon[_\s-]?error(s)?\b/gi, "흔한 실수"],
  [/\bprogression\b/gi, "강도 조절"],
];

const ROUTINE_WARNING_TEXT = /(중단|멈추|통증|어지러움|불편|지원|받으세요|위험|응급)/;

function polishRoutineText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  let text = value.trim();
  if (!text || ROUTINE_WARNING_TEXT.test(text)) {
    return "";
  }

  for (const [pattern, replacement] of ROUTINE_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function chooseRoutineText(...values: unknown[]): string {
  for (const value of values) {
    const text = polishRoutineText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function clampText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function compactExerciseNames(exercises: WeeklyRoutineExercise[], maxLength = TEXT_LIMITS.calendar): string {
  const labels = Array.from(new Set(exercises.map((exercise) => EXERCISE_LABELS[exercise.exercise]).filter(Boolean)));
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return clampText(labels[0], maxLength);
  }
  if (labels.length === 2) {
    return clampText(`${labels[0]}와 ${labels[1]}`, maxLength);
  }
  return clampText(`${labels[0]} 외 ${labels.length - 1}개`, maxLength);
}

function compactTextFromFocus(value: unknown, maxLength = TEXT_LIMITS.calendar): string {
  const source = polishRoutineText(value);
  if (!source) {
    return "";
  }
  const labels = Object.values(EXERCISE_LABELS).filter((label) => source.includes(label));
  if (labels.length) {
    return clampText(labels.length === 1 ? labels[0] : `${labels[0]}와 ${labels[1]}`, maxLength);
  }
  const cleaned = source
    .replace(/의\s*기본\s*자세\s*익히기/g, "")
    .replace(/기본\s*자세\s*익히기/g, "")
    .replace(/리듬과\s*자세\s*유지/g, "")
    .replace(/자세\s*안정성/g, "")
    .trim();
  return cleaned ? clampText(cleaned, maxLength) : "";
}

function selectedRoutineTitle(day: RoutineDay | null): string {
  if (!day) {
    return "선택 날짜 루틴 없음";
  }
  const dayIndex = day.dayIndex > 0 ? day.dayIndex : 1;
  const exerciseLabel = compactExerciseNames(day.exercises, 14) || compactTextFromFocus(day.focus, 14) || "오늘 루틴";
  return clampText(`${dayIndex}일차 - ${exerciseLabel}`, TEXT_LIMITS.title);
}

function buildRoutineReasonCards(day: RoutineDay | null, estimatedMinutes?: number | null, searching = false): RoutineReasonCard[] {
  if (!day) {
    return [
      {
        label: searching ? "확인 중" : "대기",
        title: searching ? "루틴 찾는 중" : "루틴 없음",
        body: searching ? "오늘 루틴을 확인하고 있습니다." : "달력에 루틴이 배정되면 여기에 표시됩니다.",
      },
      {
        label: "운동 준비",
        title: "오늘 루틴 확인 후 시작",
        body: "오늘 날짜에 루틴이 확인되면 운동 시작 버튼이 활성화됩니다.",
      },
    ];
  }

  const firstExercise = day.exercises[0] ?? null;
  const firstExerciseName = firstExercise ? EXERCISE_LABELS[firstExercise.exercise] : "첫 운동";
  const totalSets = day.exercises.reduce((sum, exercise) => sum + (exercise.sets ?? 1), 0);
  const firstTarget = firstExercise ? formatExerciseTarget(firstExercise.reps, firstExercise.durationSec) : "";
  const firstRest = firstExercise?.restSec ? `휴식 ${firstExercise.restSec}초` : "";
  const estimatedText = estimatedMinutes && estimatedMinutes > 0 ? `약 ${estimatedMinutes}분` : "짧게 시작";
  const intensityDetail = [firstTarget, firstRest].filter(Boolean).join(" · ");

  const cards = [
    {
      label: "오늘의 목적",
      title: chooseRoutineText(day.focus, day.weeklyFocus, day.message) || "오늘 루틴의 목표를 확인해요",
      body: chooseRoutineText(day.summary, day.weeklyFocus) || "AI가 달력에 배정한 루틴을 기준으로 오늘 할 운동을 정리했어요.",
    },
    {
      label: "운동 포인트",
      title: chooseRoutineText(firstExercise?.focus, firstExercise?.reason, day.focus) || `${firstExerciseName}를 천천히 시작해요`,
      body: chooseRoutineText(firstExercise?.howTo, firstExercise?.tips, firstExercise?.reason) || `${firstExerciseName}는 화면을 보며 정확한 자세와 리듬을 먼저 맞추면 좋아요.`,
    },
    {
      label: "진행 강도",
      title: day.exercises.length > 0 ? `${day.exercises.length}개 동작 · ${estimatedText}` : "운동 강도 확인 중",
      body:
        day.exercises.length > 0
          ? `${totalSets}세트 구성입니다.${intensityDetail ? ` 첫 동작은 ${intensityDetail}로 시작해요.` : " 오늘은 무리하지 않고 정확도를 먼저 보는 구성이에요."}`
          : "루틴이 준비되면 운동 개수와 예상 시간이 표시됩니다.",
    },
  ];

  return cards.map((card) => ({
    ...card,
    title: clampText(card.title, TEXT_LIMITS.reasonTitle),
    body: clampText(card.body, TEXT_LIMITS.reasonBody),
  }));
}

export default function ModePage({ navigate }: { navigate: NavigateFunction }) {
  const app = useAppState();
  const profile = app.activeProfile;
  const today = useMemo(todayIso, []);
  const [calendar, setCalendar] = useState<RoutineCalendar | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [todayDay, setTodayDay] = useState<RoutineDay | null>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<RoutineDay | null>(null);
  const [calendarExerciseLabels, setCalendarExerciseLabels] = useState<Record<string, string>>({});
  const [calendarNotes, setCalendarNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDayLoading, setSelectedDayLoading] = useState(false);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendarDays = calendar?.days ?? [];
  const todayRoutine = todayDay ? routineFromDay(todayDay) : null;
  const isTodaySelected = selectedDate === today;
  const selectedRoutine = selectedDayDetail ? routineFromDay(selectedDayDetail) : null;
  const canStart = Boolean(isTodaySelected && todayRoutine?.routineId && todayDay?.routineDayId && todayDay.exercises.length > 0);
  const hasSelectedRoutine = Boolean(selectedDayDetail?.exercises.length);
  const visibleExercises = selectedDayDetail?.exercises.slice(0, 3) ?? [];
  const hiddenExerciseCount = Math.max(0, (selectedDayDetail?.exercises.length ?? 0) - visibleExercises.length);
  const selectedSummary = selectedDayLoading
    ? "선택한 날짜의 루틴을 불러오는 중입니다."
    : routineLoading && !selectedDayDetail
      ? "오늘 루틴을 찾고 있습니다."
      : clampText(
          selectedDayDetail
            ? chooseRoutineText(selectedDayDetail.summary, selectedDayDetail.weeklyFocus) || "오늘 운동을 간단히 확인하세요."
            : "선택한 날짜에 등록된 루틴이 없습니다.",
          TEXT_LIMITS.reasonBody,
        );
  const routineReasonCards = useMemo(
    () => buildRoutineReasonCards(selectedDayDetail, selectedRoutine?.estimatedMinutes, routineLoading),
    [routineLoading, selectedDayDetail, selectedRoutine?.estimatedMinutes],
  );

  const hydrateCalendarLabels = useCallback(
    (days: RoutineCalendarDay[]) => {
      if (!profile) {
        return;
      }
      const routineDays = days.filter((day) => day.routineId);
      setCalendarExerciseLabels({});
      if (!routineDays.length) {
        return;
      }
      void Promise.allSettled(
        routineDays.map(async (day) => {
          const detail = await getRoutineDay(profile.id, day.date);
          return [day.date, compactExerciseNames(detail.exercises)] as const;
        }),
      ).then((results) => {
        const labels: Record<string, string> = {};
        results.forEach((result) => {
          if (result.status === "fulfilled" && result.value[1]) {
            labels[result.value[0]] = result.value[1];
          }
        });
        setCalendarExerciseLabels(labels);
      });
    },
    [profile],
  );

  const loadHome = useCallback(async () => {
    if (!profile) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const baseline = await getBaselineStatus(profile.id);
      if (!baseline.face || !baseline.body) {
        throw new Error("기준 촬영이 완료되어야 오늘 운동을 시작할 수 있습니다.");
      }

      const readCalendar = async () => {
        const nextCalendar = await getRoutineCalendar(profile.id, monthStartIso(today), monthEndIso(today));
        setCalendar(nextCalendar);
        setCalendarNotes(readDayNotes(profile.id));
        hydrateCalendarLabels(nextCalendar.days);
        setSelectedDate((current) => current || today);
        return nextCalendar;
      };

      let calendarData = await readCalendar();
      let todayInCalendar = calendarData.days.find((day) => day.date === today);

      if (!todayInCalendar?.routineId) {
        setRoutineLoading(true);
        await generateRoutine(profile);
        calendarData = await readCalendar();
        todayInCalendar = calendarData.days.find((day) => day.date === today);
        setRoutineLoading(false);
      }

      if (!todayInCalendar?.routineId) {
        setTodayDay(null);
        setSelectedDayDetail((current) => (selectedDate === today ? null : current));
        app.setSelectedRoutine(null, null);
        return;
      }

      const day = await getRoutineDay(profile.id, today);
      setTodayDay(day);
      setCalendarExerciseLabels((current) => ({ ...current, [today]: compactExerciseNames(day.exercises) }));
      if (selectedDate === today) {
        setSelectedDayDetail(day);
      }
      app.setSelectedRoutine(routineFromDay(day), day);
    } catch (caught) {
      setTodayDay(null);
      setRoutineLoading(false);
      const fallback = caught instanceof Error && caught.message.includes("기준 촬영")
        ? caught.message
        : "오늘 루틴을 찾지 못했습니다. 다시 시도해주세요.";
      setError(friendlyError(caught, fallback));
    } finally {
      setLoading(false);
    }
  }, [app, hydrateCalendarLabels, profile, selectedDate, today]);

  useEffect(() => {
    if (!profile) {
      navigate("/profile-select", { replace: true });
      return;
    }
    if (profileNeedsBaseline(profile)) {
      navigate("/baseline-setup", { replace: true });
      return;
    }
    void loadHome();
  }, []);

  useEffect(() => {
    if (!profile || !calendar) {
      return;
    }
    const calendarDay = calendar.days.find((day) => day.date === selectedDate);
    if (!calendarDay?.routineId) {
      setSelectedDayDetail(null);
      setSelectedDayLoading(false);
      return;
    }
    if (selectedDate === today && todayDay) {
      setSelectedDayDetail(todayDay);
      setSelectedDayLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedDayLoading(true);
    void getRoutineDay(profile.id, selectedDate)
      .then((day) => {
        if (!cancelled) {
          setSelectedDayDetail(day);
          setCalendarExerciseLabels((current) => ({ ...current, [selectedDate]: compactExerciseNames(day.exercises) }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedDayDetail(null);
          setError("선택한 날짜의 루틴을 불러오지 못했습니다. 다시 시도해주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedDayLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [calendar, profile, selectedDate, today, todayDay]);

  if (!profile) {
    return null;
  }

  const startWorkout = () => {
    if (!todayRoutine || !todayDay || !canStart) {
      setError("운동 시작은 오늘 날짜에 등록된 루틴만 가능합니다.");
      return;
    }
    app.setSelectedRoutine(todayRoutine, todayDay);
    app.setWorkoutRun({ routine: todayRoutine, day: todayDay, currentIndex: 0, results: [] });
    navigate("/session");
  };

  return (
    <AppShell title="루틴" step="4단계" backFallbackTo="/profile-select">
      {error ? (
        <div className="inline-alert inline-alert--error">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              void loadHome();
            }}
          >
            재시도
          </button>
        </div>
      ) : null}
      {loading ? <div className="inline-alert">오늘 운동과 월간 달력을 불러오는 중입니다.</div> : null}

      <div className="mode-home-grid">
        <section className="panel calendar-panel calendar-panel--mode">
          <div className="panel-heading-row">
            <div>
              <span className="eyebrow">달력</span>
              <h2>루틴 달력</h2>
            </div>
            <button type="button" className="button button--ghost" onClick={() => navigate(`/history?date=${encodeURIComponent(selectedDate)}`)}>
              기록 보기
            </button>
          </div>
          <div className="calendar-strip calendar-strip--month">
            {calendarDays.map((day) => (
              <button
                key={day.date}
                type="button"
                className={[
                  day.date === selectedDate ? "is-selected" : "",
                  day.date === today ? "is-today" : "",
                  day.completed ? "is-done" : "",
                  day.skipped ? "is-skipped" : "",
                  day.routineId ? "" : "is-empty",
                ].filter(Boolean).join(" ")}
                onClick={() => setSelectedDate(day.date)}
              >
                <strong>{shortDate(day.date)}</strong>
                <span>{calendarExerciseLabels[day.date] ?? compactTextFromFocus(day.focus)}</span>
                {dayNotePreview(calendarNotes[day.date] ?? "") ? <em>{dayNotePreview(calendarNotes[day.date] ?? "")}</em> : null}
              </button>
            ))}
          </div>
          <div className="calendar-legend" aria-label="달력 상태">
            <span className="is-selected">선택</span>
            <span className="is-today">오늘</span>
            <span className="is-done">완료</span>
            <span className="is-skipped">스킵</span>
          </div>
        </section>

        <section className={`panel today-panel today-panel--mode ${hasSelectedRoutine ? "" : "today-panel--empty"}`.trim()}>
          <span className="eyebrow">{isTodaySelected ? "오늘" : shortDate(selectedDate)}</span>
          <h2>{routineLoading && !selectedDayDetail ? "오늘 루틴 찾는 중" : selectedRoutineTitle(selectedDayDetail)}</h2>
          <p>{selectedSummary}</p>
          <div className="routine-list routine-list--today">
            {visibleExercises.map((exercise, index) => (
              <article key={`${exercise.exercise}-${index}`}>
                <span>{index + 1}</span>
                <strong>{EXERCISE_LABELS[exercise.exercise]}</strong>
                <em>
                  {exercise.sets ?? 1}세트 · {formatExerciseTarget(exercise.reps, exercise.durationSec)} · 휴식 {exercise.restSec ?? 45}초
                </em>
                <small>{exercise.focus || exercise.reason || "자세를 확인하며 진행"}</small>
              </article>
            ))}
            {hiddenExerciseCount > 0 ? <p className="routine-more-copy">외 {hiddenExerciseCount}개 운동</p> : null}
            {!selectedDayDetail?.exercises.length ? <p className="empty-copy">달력에 루틴이 배정되면 여기에 표시됩니다.</p> : null}
          </div>
          <div className="routine-reason-card">
            <div className="routine-reason-card__head">
              <span className="eyebrow">추천 이유</span>
              <strong>왜 이 루틴인가요?</strong>
              <p>{selectedDayDetail ? "운동 전에 알아두면 좋은 내용만 간단히 정리했어요." : "오늘 루틴을 찾고 있습니다."}</p>
            </div>
            <div className="routine-reason-grid">
              {routineReasonCards.map((card) => (
                <article key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.title}</strong>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="footer-actions">
            <button type="button" className="button button--primary" onClick={startWorkout} disabled={!canStart}>
              {routineLoading ? "루틴 찾는 중" : isTodaySelected ? (canStart ? "운동 시작" : "오늘 루틴 확인 중") : "오늘만 시작 가능"}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
