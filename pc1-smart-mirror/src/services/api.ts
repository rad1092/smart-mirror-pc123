import { normalizeProfileForPc3 } from './profileContract';

const BASE = import.meta.env.VITE_PC3_URL ?? 'http://127.0.0.1:9000';

export interface Profile {
  id: string;
  name: string;
  weight_kg: number;
  height_cm: number;
  goal: string;
  experience_level: string;
  weekly_frequency: string;
  limitations: string[];
}

export interface BaselineStatus {
  user_id: string;
  source: string;
  baseline: Record<string, unknown>;
}

export interface CaptureResult {
  valid: boolean;
  slot_type: string;
  reason: string | null;
}

export interface RoutineItem {
  exercise_type: string;
  title: string;
  reps: number | null;
  sets: number;
  rest_sec: number;
  focus: string;
  summary: string;
  reason: string;
  how_to: string;
  tips: string;
  duration_sec: number | null;
}

export interface EvidenceItem {
  id?: number | string;
  source_id?: string;
  source_title?: string;
  exercise?: string;
  category?: string;
  title?: string;
  text?: string;
  summary?: string;
  score?: number;
  rerank_logit?: number;
}

export interface WeeklyRoutineExercise {
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  duration_sec?: number | null;
  rest_sec?: number | null;
  focus: string;
  reason?: string;
  how_to?: string;
  tips?: string;
}

export interface WeeklyRoutineDay {
  day_index: number;
  day_label: string;
  focus: string;
  exercises: WeeklyRoutineExercise[];
}

export interface WeeklyAdjustment {
  direction: 'increase' | 'decrease' | 'hold' | 'hold_or_decrease' | string;
  volume_change_percent: number;
  reasons: string[];
  focus_cues: string[];
}

export interface RoutineResponse {
  source: string;
  difficulty: string;
  title: string;
  description: string;
  reason_lines?: string[];
  estimated_minutes: number;
  start_exercise_type: string;
  items: RoutineItem[];
  routine_id: string | null;
  routine_day_id?: number | string | null;
  start_date?: string | null;
  scheduled_dates?: string[];
  weekly_routine?: WeeklyRoutineDay[];
  pc3_payload?: {
    routine_id?: string;
    scheduled_dates?: string[];
    evidence?: EvidenceItem[];
    history_summary?: Record<string, unknown>;
    weekly_adjustment?: WeeklyAdjustment;
  };
  evidence?: EvidenceItem[];
  history_summary?: Record<string, unknown>;
  weekly_adjustment?: WeeklyAdjustment;
}

export interface RoutineDayResponse {
  routine_day_id: number | null;
  routine_id: string;
  user_id: string;
  scheduled_date: string;
  day_index: number;
  day_label: string;
  focus: string;
  exercises: WeeklyRoutineExercise[];
  summary: string;
  weekly_focus: string;
  message: string;
  created_at?: string | null;
}

export interface WorkoutResult {
  id?: number;
  session_id?: string | null;
  user_id?: string;
  routine_id?: string | null;
  routine_day_id?: number | string | null;
  exercise_type?: string;
  completed_reps?: number;
  duration_sec?: number;
  stability_score?: number | null;
  posture_errors?: string[];
  measurement_quality?: string | null;
  measurement_confidence?: number | null;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface CalendarDay {
  date: string;
  routine_id?: string | null;
  routine_day_id?: number | null;
  day_index?: number | null;
  focus?: string | null;
  exercises: WeeklyRoutineExercise[];
  completed: boolean;
  skipped?: boolean;
  skipped_count?: number;
  workout_results: WorkoutResult[];
  coach_log_ids: number[];
}

export interface CalendarResponse {
  user_id: string;
  from_date: string;
  to_date: string;
  days: CalendarDay[];
}

export interface BodyMetricRecord {
  id: number;
  user_id: string;
  measured_date: string;
  weight_kg: number;
  memo?: string | null;
  created_at: string;
}

export interface WorkoutSummary {
  session_count?: number;
  workout_count?: number;
  skipped_count?: number;
  total_reps?: number;
  total_duration_sec?: number;
  avg_stability_score?: number | null;
  by_exercise?: Record<string, number>;
}

export interface CoachLog {
  id?: number;
  request_id?: string;
  session_id?: string | null;
  user_id?: string;
  mode?: string;
  purpose?: string | null;
  request?: Record<string, unknown>;
  pc2_output?: Record<string, unknown>;
  final_response?: SessionStopResponse['coaching'];
  model_name?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ProgressResponse {
  user_id: string;
  days: number;
  body_metrics: BodyMetricRecord[];
  weight_delta_kg: number | null;
  workout_summary: WorkoutSummary;
  recent_workouts: WorkoutResult[];
  recent_coaching: CoachLog[];
  latest_routine?: {
    routine_id?: string;
    routine_response?: {
      pc3_payload?: {
        evidence?: EvidenceItem[];
        history_summary?: Record<string, unknown>;
        weekly_adjustment?: WeeklyAdjustment;
      };
      evidence?: EvidenceItem[];
      history_summary?: Record<string, unknown>;
      weekly_adjustment?: WeeklyAdjustment;
      scheduled_dates?: string[];
      weekly_routine?: WeeklyRoutineDay[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  } | null;
}

export interface SessionStartResponse {
  session_id: string;
  user_id: string;
  mode: string;
  goal: string;
  status: string;
  ws_url: string;
}

export interface AnalyzeResponse {
  session_id: string;
  type: string;
  exercise: {
    type: string;
    count: number;
    state: string;
    stability_score: number;
    posture_errors: string[];
    person_count: number;
    target_status: string;
    target_confidence: number;
    detected_type: string;
    exercise_confidence: number;
    goal_mismatch: boolean;
    measurement_quality: string;
    measurement_confidence: number;
    count_left: number | null;
    count_right: number | null;
    squat_depth: number | null;
    knee_angle: number | null;
    back_angle: number | null;
  };
  feedback: string;
}

export interface SessionStopResponse {
  session_id: string;
  status: string;
  features: Record<string, unknown>;
  coaching: {
    summary: string;
    priority: string;
    mirror_message: string;
    warnings: string[];
    pc2_payload?: {
      message?: string;
      display_lines?: string[];
      evidence?: EvidenceItem[];
    };
  };
}

export interface SessionSkipResponse {
  session_id: string;
  status: string;
  features?: Record<string, unknown>;
  skip_reason?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`PC3 ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listProfiles(): Promise<{ profiles: Profile[] }> {
  return request('/api/users/profiles');
}

export async function createProfile(profile: Profile): Promise<Profile> {
  return request('/api/users/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeProfileForPc3(profile)),
  });
}

export async function updateProfile(profile: Profile): Promise<Profile> {
  const normalized = normalizeProfileForPc3(profile);
  return request(`/api/users/profiles/${encodeURIComponent(normalized.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  });
}

export async function deleteProfile(userId: string): Promise<{ deleted: boolean; user_id: string }> {
  return request(`/api/users/profiles/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function getBaselineStatus(userId: string): Promise<BaselineStatus> {
  return request(`/api/baselines/users/${userId}`);
}

export async function captureBaseline(
  userId: string,
  slotType: 'face_front' | 'body_front_full',
  blob: Blob,
): Promise<CaptureResult> {
  const form = new FormData();
  form.append('slot_type', slotType);
  form.append('file', blob, 'frame.jpg');
  return request(`/api/baselines/users/${userId}/capture`, {
    method: 'POST',
    body: form,
  });
}

export async function getRoutine(
  profile: Profile,
  baselineCompleted: boolean,
): Promise<RoutineResponse> {
  const pc3Profile = normalizeProfileForPc3(profile);
  const body = {
    user_id: pc3Profile.id,
    profile: {
      name: pc3Profile.name,
      weight_kg: pc3Profile.weight_kg,
      height_cm: pc3Profile.height_cm,
      goal: pc3Profile.goal,
      experience_level: pc3Profile.experience_level,
      weekly_frequency: pc3Profile.weekly_frequency,
      limitations: pc3Profile.limitations,
    },
    baseline: {
      ready: baselineCompleted,
      completed_slots: baselineCompleted ? ['face_front', 'body_front_full'] : [],
    },
    start_date: new Date().toISOString().slice(0, 10),
    purpose: 'pre_exercise_routine',
  };
  return request('/api/routines/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getRoutineDay(
  userId: string,
  targetDate: string,
): Promise<RoutineDayResponse> {
  return request(`/api/routines/profile/${encodeURIComponent(userId)}/day?target_date=${encodeURIComponent(targetDate)}`);
}

export async function getRoutineCalendar(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<CalendarResponse> {
  const qs = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  return request(`/api/routines/profile/${encodeURIComponent(userId)}/calendar?${qs.toString()}`);
}

export async function saveBodyMetric(
  userId: string,
  measuredDate: string,
  weightKg: number,
  memo = '',
): Promise<BodyMetricRecord> {
  return request(`/api/users/${encodeURIComponent(userId)}/body-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      measured_date: measuredDate,
      weight_kg: weightKg,
      memo: memo.trim() || null,
    }),
  });
}

export async function getProgress(userId: string, days = 30): Promise<ProgressResponse> {
  return request(`/api/users/${encodeURIComponent(userId)}/progress?days=${encodeURIComponent(String(days))}`);
}

export async function getCoachLogs(userId: string, limit = 100): Promise<{ logs: CoachLog[] }> {
  return request(`/api/coach/logs/${encodeURIComponent(userId)}?limit=${encodeURIComponent(String(limit))}`);
}

export async function startSession(
  userId: string,
  goal: string,
  routineId?: string | null,
  routineDayId?: number | string | null,
): Promise<SessionStartResponse> {
  const body: Record<string, unknown> = { user_id: userId, mode: 'exercise', goal };
  if (routineId) body.routine_id = routineId;
  if (routineDayId != null) body.routine_day_id = routineDayId;

  return request('/api/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function uploadFrame(
  sessionId: string,
  blob: Blob,
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('file', blob, 'frame.jpg');
  return request('/api/analyze/exercise', { method: 'POST', body: form });
}

export async function stopSession(sessionId: string): Promise<SessionStopResponse> {
  return request(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
}

export async function skipSession(sessionId: string, reason = '사용자가 운동을 넘김'): Promise<SessionSkipResponse> {
  return request(`/api/sessions/${sessionId}/skip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}
