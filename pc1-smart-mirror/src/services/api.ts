import type {
  BaselineSlot,
  BodyMetricRecord,
  CoachLog,
  CoachingPayload,
  EvidenceItem,
  ExerciseGoal,
  ExerciseType,
  ExperienceLevel,
  Limitation,
  ProgressResponse,
  ProgressSummary,
  RoutineBundle,
  RoutineCalendar,
  RoutineCalendarDay,
  RoutineDay,
  SessionFinalResponse,
  SessionStartResponse,
  UserProfile,
  WeeklyAdjustment,
  WeeklyFrequency,
  WeeklyRoutineExercise,
  WorkoutResult,
} from "../types/domain";
import { todayIso } from "../utils/format";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const API_BASE_URL = String(import.meta.env.VITE_PC3_URL ?? "http://127.0.0.1:9000").replace(
  /\/$/,
  "",
);

const GOALS: ExerciseGoal[] = ["build_stamina", "posture_correction", "lower_body_strength", "build_habit", "weight_management"];
const EXPERIENCES: ExperienceLevel[] = ["beginner", "casual", "consistent"];
const FREQUENCIES: WeeklyFrequency[] = ["once_twice", "three_four", "five_plus"];
const LIMITATIONS: Limitation[] = ["knee", "back", "shoulder", "ankle"];
const EXERCISES: ExerciseType[] = ["squat", "jumping_jack", "knee_raise", "lunge", "pushup"];

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function pc3Fetch(input: string, init?: RequestInit): Promise<Response> {
  return isTauriRuntime() ? tauriFetch(input, init) : fetch(input, init);
}

type Pc3Profile = {
  id?: string;
  user_id?: string;
  name?: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  experience_level?: string | null;
  weekly_frequency?: string | null;
  limitations?: unknown[];
  status?: string | null;
};

type RawRecord = Record<string, unknown>;

export class ApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit, message = "요청을 처리하지 못했습니다. 다시 시도해주세요."): Promise<T> {
  let response: Response;
  try {
    response = await pc3Fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError("서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.", null);
  }

  if (!response.ok) {
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pickString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T | null): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function normalizeLimitations(values: unknown): Limitation[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.filter((value): value is Limitation => typeof value === "string" && LIMITATIONS.includes(value as Limitation))));
}

function normalizeExercise(value: unknown): ExerciseType {
  return typeof value === "string" && EXERCISES.includes(value as ExerciseType) ? (value as ExerciseType) : "squat";
}

export function normalizeProfile(payload: Pc3Profile, existing?: UserProfile | null): UserProfile {
  const id = String(payload.id ?? payload.user_id ?? existing?.id ?? `profile_${Date.now()}`);
  const baselineSlots = existing?.baselineSlots ?? { face_front: false, body_front_full: false };
  const status = payload.status === "ready" || existing?.status === "ready" ? "ready" : "baseline_pending";

  return {
    id,
    name: pickString(payload.name, existing?.name ?? "User"),
    weightKg: typeof payload.weight_kg === "number" && payload.weight_kg > 0 ? payload.weight_kg : existing?.weightKg ?? null,
    heightCm: typeof payload.height_cm === "number" && payload.height_cm > 0 ? payload.height_cm : existing?.heightCm ?? null,
    goal: normalizeEnum(payload.goal, GOALS, existing?.goal ?? null),
    experienceLevel: normalizeEnum(payload.experience_level, EXPERIENCES, existing?.experienceLevel ?? null),
    weeklyFrequency: normalizeEnum(payload.weekly_frequency, FREQUENCIES, existing?.weeklyFrequency ?? null),
    limitations: normalizeLimitations(payload.limitations).length ? normalizeLimitations(payload.limitations) : existing?.limitations ?? [],
    status,
    baselineSlots,
    lastUsedAt: existing?.lastUsedAt ?? null,
  };
}

function profileToPc3(profile: UserProfile): Pc3Profile {
  return {
    id: profile.id,
    user_id: profile.id,
    name: profile.name,
    weight_kg: profile.weightKg ?? 0,
    height_cm: profile.heightCm ?? 0,
    goal: profile.goal ?? "build_habit",
    experience_level: profile.experienceLevel ?? "beginner",
    weekly_frequency: profile.weeklyFrequency ?? "three_four",
    limitations: profile.limitations,
  };
}

export function hasRequiredProfileInput(profile: UserProfile): boolean {
  return Boolean(
    profile.weightKg &&
      profile.weightKg > 0 &&
      profile.heightCm &&
      profile.heightCm > 0 &&
      profile.goal &&
      profile.experienceLevel &&
      profile.weeklyFrequency,
  );
}

export function profileNeedsBaseline(profile: UserProfile): boolean {
  return !hasRequiredProfileInput(profile) || profile.status !== "ready" || !profile.baselineSlots.face_front || !profile.baselineSlots.body_front_full;
}

export async function listProfiles(existing: UserProfile[] = []): Promise<UserProfile[]> {
  const payload = await request<{ profiles?: Pc3Profile[] } | Pc3Profile[]>("/api/users/profiles", undefined, "프로필 목록을 불러오지 못했습니다. 다시 시도해주세요.");
  const list = Array.isArray(payload) ? payload : payload.profiles ?? [];
  const byId = new Map(existing.map((profile) => [profile.id, profile]));
  return list.map((profile) => normalizeProfile(profile, byId.get(String(profile.id ?? profile.user_id ?? "")) ?? null));
}

export async function createProfile(name: string): Promise<UserProfile> {
  const payload = await request<Pc3Profile>(
    "/api/users/profiles",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    "프로필을 생성하지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeProfile(payload);
}

export async function updateProfile(profile: UserProfile): Promise<UserProfile> {
  const payload = await request<Pc3Profile>(
    `/api/users/profiles/${encodeURIComponent(profile.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileToPc3(profile)),
    },
    "프로필 정보를 저장하지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeProfile(payload, profile);
}

export async function deleteProfile(userId: string): Promise<void> {
  await request<void>(
    `/api/users/profiles/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    "프로필을 삭제하지 못했습니다. 다시 시도해주세요.",
  );
}

export async function getBaselineStatus(userId: string): Promise<{ face: boolean; body: boolean }> {
  const payload = await request<{ baseline?: { face?: { face_front?: { captured?: boolean } }; body?: { body_front_full?: { captured?: boolean } } } }>(
    `/api/baselines/users/${encodeURIComponent(userId)}`,
    undefined,
    "기준 촬영 상태를 확인하지 못했습니다. 다시 시도해주세요.",
  );
  return {
    face: Boolean(payload.baseline?.face?.face_front?.captured),
    body: Boolean(payload.baseline?.body?.body_front_full?.captured),
  };
}

export async function captureBaseline(userId: string, slot: BaselineSlot, file: Blob): Promise<{ valid: boolean; reason: string | null }> {
  const form = new FormData();
  form.append("slot_type", slot);
  form.append("file", file, "baseline.jpg");
  return request(`/api/baselines/users/${encodeURIComponent(userId)}/capture`, { method: "POST", body: form }, "기준 촬영을 저장하지 못했습니다. 다시 시도해주세요.");
}

export async function saveBodyMetric(userId: string, weightKg: number, memo = "pc1_profile_input"): Promise<BodyMetricRecord> {
  const payload = await request<RawRecord>(
    `/api/users/${encodeURIComponent(userId)}/body-metrics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ measured_date: todayIso(), weight_kg: weightKg, memo }),
    },
    "몸무게 기록을 저장하지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeBodyMetric(payload);
}

function normalizeWeeklyExercise(payload: RawRecord): WeeklyRoutineExercise {
  return {
    exercise: normalizeExercise(payload.exercise ?? payload.exercise_type),
    sets: typeof payload.sets === "number" ? payload.sets : null,
    reps: typeof payload.reps === "number" ? payload.reps : null,
    durationSec: typeof payload.duration_sec === "number" ? payload.duration_sec : null,
    restSec: typeof payload.rest_sec === "number" ? payload.rest_sec : null,
    focus: pickString(payload.focus),
    reason: pickString(payload.reason),
    howTo: pickString(payload.how_to),
    tips: pickString(payload.tips),
  };
}

function estimateMinutes(exercises: WeeklyRoutineExercise[]): number {
  const seconds = exercises.reduce((sum, exercise) => {
    const work = exercise.durationSec ?? (exercise.reps ?? 10) * 3;
    const rest = exercise.restSec ?? 45;
    return sum + (exercise.sets ?? 1) * (work + rest);
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

function normalizeRoutineDay(payload: RawRecord): RoutineDay {
  const exercises = Array.isArray(payload.exercises) ? payload.exercises.map((item) => normalizeWeeklyExercise(item as RawRecord)) : [];
  return {
    routineDayId: (payload.routine_day_id as string | number | null | undefined) ?? null,
    routineId: typeof payload.routine_id === "string" ? payload.routine_id : null,
    scheduledDate: pickString(payload.scheduled_date, todayIso()),
    dayIndex: typeof payload.day_index === "number" ? payload.day_index : 1,
    dayLabel: pickString(payload.day_label, "Day 1"),
    focus: pickString(payload.focus, "오늘 루틴"),
    summary: pickString(payload.summary),
    weeklyFocus: pickString(payload.weekly_focus),
    message: pickString(payload.message, "오늘 루틴"),
    exercises,
  };
}

function normalizeEvidence(values: unknown): EvidenceItem[] {
  return Array.isArray(values) ? (values.filter((item) => typeof item === "object" && item !== null) as EvidenceItem[]) : [];
}

function normalizeStringArray(values: unknown): string[] {
  return Array.isArray(values) ? values.map(String) : [];
}

function normalizeCoachingPayload(value: unknown): CoachingPayload | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const payload = value as RawRecord;
  const pc2Payload = typeof payload.pc2_payload === "object" && payload.pc2_payload !== null ? (payload.pc2_payload as RawRecord) : undefined;
  return {
    summary: typeof payload.summary === "string" ? payload.summary : undefined,
    priority: typeof payload.priority === "string" ? payload.priority : undefined,
    mirror_message: typeof payload.mirror_message === "string" ? payload.mirror_message : undefined,
    warnings: normalizeStringArray(payload.warnings),
    pc2_payload: pc2Payload
      ? {
          message: typeof pc2Payload.message === "string" ? pc2Payload.message : undefined,
          display_lines: normalizeStringArray(pc2Payload.display_lines),
          evidence: normalizeEvidence(pc2Payload.evidence),
        }
      : undefined,
  };
}

export function normalizeSessionFinalResponse(payload: RawRecord): SessionFinalResponse {
  const features = typeof payload.features === "object" && payload.features !== null ? (payload.features as Record<string, unknown>) : undefined;
  const baselineDiff = typeof payload.baseline_diff === "object" && payload.baseline_diff !== null ? (payload.baseline_diff as Record<string, unknown>) : undefined;
  const environment = typeof payload.environment === "object" && payload.environment !== null ? (payload.environment as Record<string, unknown>) : undefined;
  return {
    session_id: pickString(payload.session_id),
    status: pickString(payload.status, "completed"),
    features,
    baseline_diff: baselineDiff,
    environment,
    coaching: normalizeCoachingPayload(payload.coaching),
    skip_reason: typeof payload.skip_reason === "string" ? payload.skip_reason : null,
  };
}

export function normalizeRoutineBundle(payload: RawRecord): RoutineBundle {
  const scheduledDates = Array.isArray(payload.scheduled_dates) ? payload.scheduled_dates.map(String) : [];
  const rawWeekly = Array.isArray(payload.weekly_routine) ? payload.weekly_routine : [];
  const weeklyRoutine = rawWeekly.map((item, index) => {
    const day = normalizeRoutineDay(item as RawRecord);
    return { ...day, scheduledDate: scheduledDates[index] ?? day.scheduledDate, routineId: typeof payload.routine_id === "string" ? payload.routine_id : day.routineId };
  });
  const pc3Payload = typeof payload.pc3_payload === "object" && payload.pc3_payload !== null ? (payload.pc3_payload as RawRecord) : {};

  return {
    source: pickString(payload.source, "ai"),
    difficulty: pickString(payload.difficulty, "normal"),
    title: pickString(payload.title, "추천 루틴"),
    description: pickString(payload.description),
    reasonLines: Array.isArray(payload.reason_lines) ? payload.reason_lines.map(String) : [],
    estimatedMinutes: typeof payload.estimated_minutes === "number" ? payload.estimated_minutes : estimateMinutes(weeklyRoutine[0]?.exercises ?? []),
    startExerciseType: normalizeExercise(payload.start_exercise_type),
    routineId: typeof payload.routine_id === "string" ? payload.routine_id : null,
    routineDayId: (payload.routine_day_id as string | number | null | undefined) ?? weeklyRoutine[0]?.routineDayId ?? null,
    startDate: typeof payload.start_date === "string" ? payload.start_date : null,
    scheduledDates,
    weeklyRoutine,
    evidence: normalizeEvidence(payload.evidence).length ? normalizeEvidence(payload.evidence) : normalizeEvidence(pc3Payload.evidence),
    historySummary:
      typeof payload.history_summary === "object" && payload.history_summary !== null
        ? (payload.history_summary as Record<string, unknown>)
        : typeof pc3Payload.history_summary === "object" && pc3Payload.history_summary !== null
          ? (pc3Payload.history_summary as Record<string, unknown>)
          : {},
    weeklyAdjustment:
      typeof payload.weekly_adjustment === "object" && payload.weekly_adjustment !== null
        ? (payload.weekly_adjustment as WeeklyAdjustment)
        : typeof pc3Payload.weekly_adjustment === "object" && pc3Payload.weekly_adjustment !== null
          ? (pc3Payload.weekly_adjustment as WeeklyAdjustment)
          : null,
  };
}

export function routineFromDay(day: RoutineDay): RoutineBundle {
  return {
    source: "pc3",
    difficulty: "normal",
    title: day.message || day.focus || "오늘 루틴",
    description: day.summary || day.weeklyFocus,
    reasonLines: [day.weeklyFocus, day.focus].filter(Boolean),
    estimatedMinutes: estimateMinutes(day.exercises),
    startExerciseType: day.exercises[0]?.exercise ?? "squat",
    routineId: day.routineId,
    routineDayId: day.routineDayId,
    startDate: day.scheduledDate,
    scheduledDates: [day.scheduledDate],
    weeklyRoutine: [day],
    evidence: [],
    historySummary: {},
    weeklyAdjustment: null,
  };
}

export async function generateRoutine(profile: UserProfile): Promise<RoutineBundle> {
  const body = {
    user_id: profile.id,
    profile: {
      name: profile.name,
      weight_kg: profile.weightKg,
      height_cm: profile.heightCm,
      goal: profile.goal,
      experience_level: profile.experienceLevel,
      weekly_frequency: profile.weeklyFrequency,
      limitations: profile.limitations,
    },
    baseline: {
      ready: profile.status === "ready" && profile.baselineSlots.face_front && profile.baselineSlots.body_front_full,
      completed_slots: (["face_front", "body_front_full"] as BaselineSlot[]).filter((slot) => profile.baselineSlots[slot]),
    },
    start_date: todayIso(),
    purpose: "pre_exercise_routine",
  };
  const payload = await request<RawRecord>(
    "/api/routines/profile",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "추천 루틴을 불러오지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeRoutineBundle(payload);
}

export async function getRoutineCalendar(userId: string, fromDate: string, toDate: string): Promise<RoutineCalendar> {
  const qs = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  const payload = await request<{ user_id?: string; from_date?: string; to_date?: string; days?: RawRecord[] }>(
    `/api/routines/profile/${encodeURIComponent(userId)}/calendar?${qs.toString()}`,
    undefined,
    "루틴 달력을 불러오지 못했습니다. 다시 시도해주세요.",
  );
  return {
    userId: pickString(payload.user_id, userId),
    fromDate: pickString(payload.from_date, fromDate),
    toDate: pickString(payload.to_date, toDate),
    days: (payload.days ?? []).map(normalizeCalendarDay),
  };
}

function normalizeCalendarDay(payload: RawRecord): RoutineCalendarDay {
  return {
    date: pickString(payload.date),
    routineId: typeof payload.routine_id === "string" ? payload.routine_id : null,
    routineDayId: (payload.routine_day_id as string | number | null | undefined) ?? null,
    dayIndex: typeof payload.day_index === "number" ? payload.day_index : null,
    focus: typeof payload.focus === "string" ? payload.focus : null,
    completed: Boolean(payload.completed),
    skipped: Boolean(payload.skipped),
    skippedCount: Number(payload.skipped_count ?? 0),
    workoutResults: Array.isArray(payload.workout_results) ? payload.workout_results.map((item) => normalizeWorkoutResult(item as RawRecord)) : [],
    coachLogIds: Array.isArray(payload.coach_log_ids) ? payload.coach_log_ids.map(Number) : [],
  };
}

export async function getRoutineDay(userId: string, targetDate: string): Promise<RoutineDay> {
  const qs = new URLSearchParams({ target_date: targetDate });
  const payload = await request<RawRecord>(
    `/api/routines/profile/${encodeURIComponent(userId)}/day?${qs.toString()}`,
    undefined,
    "선택한 날짜의 루틴을 불러오지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeRoutineDay(payload);
}

function normalizeBodyMetric(payload: RawRecord): BodyMetricRecord {
  return {
    id: (payload.id as string | number | undefined) ?? `${payload.measured_date ?? Date.now()}`,
    userId: pickString(payload.user_id),
    measuredDate: pickString(payload.measured_date),
    weightKg: Number(payload.weight_kg ?? 0),
    memo: typeof payload.memo === "string" ? payload.memo : null,
    createdAt: typeof payload.created_at === "string" ? payload.created_at : null,
  };
}

function normalizeWorkoutResult(payload: RawRecord): WorkoutResult {
  const result = typeof payload.result === "object" && payload.result !== null ? payload.result : undefined;
  return {
    id: payload.id as string | number | undefined,
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    userId: typeof payload.user_id === "string" ? payload.user_id : null,
    routineId: typeof payload.routine_id === "string" ? payload.routine_id : null,
    routineDayId: (payload.routine_day_id as string | number | null | undefined) ?? null,
    exerciseType: typeof payload.exercise_type === "string" ? payload.exercise_type : undefined,
    completedReps: typeof payload.completed_reps === "number" ? payload.completed_reps : undefined,
    durationSec: typeof payload.duration_sec === "number" ? payload.duration_sec : undefined,
    stabilityScore: typeof payload.stability_score === "number" ? payload.stability_score : null,
    postureErrors: Array.isArray(payload.posture_errors) ? payload.posture_errors.map(String) : [],
    measurementQuality: typeof payload.measurement_quality === "string" ? payload.measurement_quality : null,
    measurementConfidence: typeof payload.measurement_confidence === "number" ? payload.measurement_confidence : null,
    status: typeof payload.status === "string" ? payload.status : undefined,
    createdAt: typeof payload.created_at === "string" ? payload.created_at : null,
    result,
  };
}

function normalizeCoachLog(payload: RawRecord): CoachLog {
  return {
    id: payload.id as string | number | undefined,
    requestId: typeof payload.request_id === "string" ? payload.request_id : undefined,
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    userId: typeof payload.user_id === "string" ? payload.user_id : null,
    purpose: typeof payload.purpose === "string" ? payload.purpose : null,
    request: typeof payload.request === "object" && payload.request !== null ? (payload.request as Record<string, unknown>) : undefined,
    pc2Output: typeof payload.pc2_output === "object" && payload.pc2_output !== null ? (payload.pc2_output as Record<string, unknown>) : undefined,
    finalResponse: normalizeCoachingPayload(payload.final_response),
    modelName: typeof payload.model_name === "string" ? payload.model_name : undefined,
    createdAt: typeof payload.created_at === "string" ? payload.created_at : null,
  };
}

export async function getProgress(userId: string, days = 30): Promise<ProgressResponse> {
  const payload = await request<RawRecord>(
    `/api/users/${encodeURIComponent(userId)}/progress?days=${encodeURIComponent(String(days))}`,
    undefined,
    "진행 요약을 불러오지 못했습니다. 다시 시도해주세요.",
  );
  const summary = (typeof payload.workout_summary === "object" && payload.workout_summary !== null ? payload.workout_summary : {}) as RawRecord;
  const workoutSummary: ProgressSummary = {
    sessionCount: Number(summary.session_count ?? 0),
    workoutCount: Number(summary.workout_count ?? 0),
    skippedCount: Number(summary.skipped_count ?? 0),
    totalReps: Number(summary.total_reps ?? 0),
    totalDurationSec: Number(summary.total_duration_sec ?? 0),
    avgStabilityScore: typeof summary.avg_stability_score === "number" ? summary.avg_stability_score : null,
    byExercise:
      typeof summary.by_exercise === "object" && summary.by_exercise !== null
        ? Object.fromEntries(Object.entries(summary.by_exercise as Record<string, unknown>).map(([key, value]) => [key, Number(value ?? 0)]))
        : {},
  };

  return {
    userId,
    days: Number(payload.days ?? days),
    bodyMetrics: Array.isArray(payload.body_metrics) ? payload.body_metrics.map((item) => normalizeBodyMetric(item as RawRecord)) : [],
    weightDeltaKg: typeof payload.weight_delta_kg === "number" ? payload.weight_delta_kg : null,
    workoutSummary,
    recentWorkouts: Array.isArray(payload.recent_workouts) ? payload.recent_workouts.map((item) => normalizeWorkoutResult(item as RawRecord)) : [],
    recentCoaching: Array.isArray(payload.recent_coaching) ? payload.recent_coaching.map((item) => normalizeCoachLog(item as RawRecord)) : [],
    latestRoutine:
      typeof payload.latest_routine === "object" && payload.latest_routine !== null ? (payload.latest_routine as ProgressResponse["latestRoutine"]) : null,
  };
}

export async function getCoachLogs(userId: string, limit = 20): Promise<CoachLog[]> {
  const payload = await request<{ logs?: RawRecord[] }>(
    `/api/coach/logs/${encodeURIComponent(userId)}?limit=${encodeURIComponent(String(limit))}`,
    undefined,
    "코칭 로그를 불러오지 못했습니다. 다시 시도해주세요.",
  );
  return (payload.logs ?? []).map(normalizeCoachLog);
}

export async function startSession(userId: string, exercise: ExerciseType, routineId?: string | null, routineDayId?: string | number | null): Promise<SessionStartResponse> {
  const body: Record<string, unknown> = { user_id: userId, mode: "exercise", goal: exercise };
  if (routineId) {
    body.routine_id = routineId;
  }
  if (routineDayId !== null && routineDayId !== undefined) {
    body.routine_day_id = routineDayId;
  }
  return request(
    "/api/sessions/start",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "운동 세션을 시작하지 못했습니다. 다시 시도해주세요.",
  );
}

export async function uploadFrame(sessionId: string, blob: Blob): Promise<unknown> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("file", blob, "frame.jpg");
  return request("/api/analyze/exercise", { method: "POST", body: form }, "운동 화면 분석에 실패했습니다. 다시 시도해주세요.");
}

export async function stopSession(sessionId: string): Promise<SessionFinalResponse> {
  const payload = await request<RawRecord>(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, { method: "POST" }, "운동 결과를 받지 못했습니다. 다시 시도해주세요.");
  return normalizeSessionFinalResponse(payload);
}

export async function skipSession(sessionId: string, reason = "user_skipped"): Promise<SessionFinalResponse> {
  const payload = await request<RawRecord>(
    `/api/sessions/${encodeURIComponent(sessionId)}/skip`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) },
    "운동 건너뛰기를 기록하지 못했습니다. 다시 시도해주세요.",
  );
  return normalizeSessionFinalResponse(payload);
}

export async function getSessionResult(sessionId: string): Promise<SessionFinalResponse> {
  const payload = await request<RawRecord>(`/api/sessions/${encodeURIComponent(sessionId)}/result`, undefined, "저장된 세션 결과를 다시 불러오지 못했습니다.");
  return normalizeSessionFinalResponse(payload);
}

export function evidenceFromRoutineAndProgress(routine: RoutineBundle | null, progress: ProgressResponse | null): EvidenceItem[] {
  if (routine?.evidence.length) {
    return routine.evidence;
  }
  const latest = progress?.latestRoutine?.routineResponse;
  const pc3Payload = latest?.pc3_payload;
  return normalizeEvidence(pc3Payload?.evidence ?? latest?.evidence);
}

export function historyFromRoutineAndProgress(routine: RoutineBundle | null, progress: ProgressResponse | null): Record<string, unknown> {
  if (routine && Object.keys(routine.historySummary).length) {
    return routine.historySummary;
  }
  const latest = progress?.latestRoutine?.routineResponse;
  return latest?.pc3_payload?.history_summary ?? latest?.history_summary ?? {};
}

export function adjustmentFromRoutineAndProgress(routine: RoutineBundle | null, progress: ProgressResponse | null): WeeklyAdjustment | null {
  if (routine?.weeklyAdjustment) {
    return routine.weeklyAdjustment;
  }
  const latest = progress?.latestRoutine?.routineResponse;
  return latest?.pc3_payload?.weekly_adjustment ?? latest?.weekly_adjustment ?? null;
}
