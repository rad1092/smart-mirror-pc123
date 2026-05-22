export type ExerciseType = "squat" | "jumping_jack" | "knee_raise" | "lunge" | "pushup";
export type ExerciseGoal =
  | "build_stamina"
  | "posture_correction"
  | "lower_body_strength"
  | "build_habit"
  | "weight_management";
export type ExperienceLevel = "beginner" | "casual" | "consistent";
export type WeeklyFrequency = "once_twice" | "three_four" | "five_plus";
export type Limitation = "knee" | "back" | "shoulder" | "ankle";
export type BaselineSlot = "face_front" | "body_front_full";
export type ProfileStatus = "baseline_pending" | "ready";

export type UserProfile = {
  id: string;
  name: string;
  weightKg: number | null;
  heightCm: number | null;
  goal: ExerciseGoal | null;
  experienceLevel: ExperienceLevel | null;
  weeklyFrequency: WeeklyFrequency | null;
  limitations: Limitation[];
  status: ProfileStatus;
  baselineSlots: Record<BaselineSlot, boolean>;
  lastUsedAt: string | null;
};

export type WeeklyRoutineExercise = {
  exercise: ExerciseType;
  sets: number | null;
  reps: number | null;
  durationSec: number | null;
  restSec: number | null;
  focus: string;
  reason: string;
  howTo: string;
  tips: string;
};

export type RoutineDay = {
  routineDayId: string | number | null;
  routineId: string | null;
  scheduledDate: string;
  dayIndex: number;
  dayLabel: string;
  focus: string;
  summary: string;
  weeklyFocus: string;
  message: string;
  exercises: WeeklyRoutineExercise[];
};

export type RoutineCalendarDay = {
  date: string;
  routineId: string | null;
  routineDayId: string | number | null;
  dayIndex: number | null;
  focus: string | null;
  completed: boolean;
  skipped: boolean;
  skippedCount: number;
  workoutResults: WorkoutResult[];
  coachLogIds: number[];
};

export type RoutineCalendar = {
  userId: string;
  fromDate: string;
  toDate: string;
  days: RoutineCalendarDay[];
};

export type EvidenceItem = {
  id?: string | number;
  source_id?: string;
  source_title?: string;
  source?: string;
  source_url?: string;
  evidence_level?: string;
  exercise?: string;
  exercise_label?: string;
  category?: string;
  category_label?: string;
  title?: string;
  original_title?: string;
  original_source?: string;
  text?: string;
  summary?: string;
  score?: number;
  rerank_logit?: number;
};

export type WeeklyAdjustment = {
  direction: "increase" | "decrease" | "hold" | "hold_or_decrease" | string;
  volume_change_percent: number;
  reasons: string[];
  focus_cues: string[];
};

export type RoutineBundle = {
  source: string;
  difficulty: string;
  title: string;
  description: string;
  reasonLines: string[];
  estimatedMinutes: number;
  startExerciseType: ExerciseType;
  routineId: string | null;
  routineDayId: string | number | null;
  startDate: string | null;
  scheduledDates: string[];
  weeklyRoutine: RoutineDay[];
  evidence: EvidenceItem[];
  historySummary: Record<string, unknown>;
  weeklyAdjustment: WeeklyAdjustment | null;
};

export type BodyMetricRecord = {
  id: number | string;
  userId: string;
  measuredDate: string;
  weightKg: number;
  memo: string | null;
  createdAt: string | null;
};

export type WorkoutResult = {
  id?: number | string;
  sessionId?: string | null;
  userId?: string | null;
  routineId?: string | null;
  routineDayId?: string | number | null;
  exerciseType?: string;
  completedReps?: number;
  durationSec?: number;
  stabilityScore?: number | null;
  postureErrors?: string[];
  measurementQuality?: string | null;
  measurementConfidence?: number | null;
  status?: string;
  createdAt?: string | null;
  result?: unknown;
};

export type ProgressSummary = {
  sessionCount: number;
  workoutCount: number;
  skippedCount: number;
  totalReps: number;
  totalDurationSec: number;
  avgStabilityScore: number | null;
  byExercise: Record<string, number>;
};

export type ProgressResponse = {
  userId: string;
  days: number;
  bodyMetrics: BodyMetricRecord[];
  weightDeltaKg: number | null;
  workoutSummary: ProgressSummary;
  recentWorkouts: WorkoutResult[];
  recentCoaching: CoachLog[];
  latestRoutine: {
    routineId?: string;
    routineResponse?: Partial<RoutineBundle> & {
      pc3_payload?: {
        evidence?: EvidenceItem[];
        history_summary?: Record<string, unknown>;
        weekly_adjustment?: WeeklyAdjustment;
      };
      evidence?: EvidenceItem[];
      history_summary?: Record<string, unknown>;
      weekly_adjustment?: WeeklyAdjustment;
    };
  } | null;
};

export type CoachLog = {
  id?: number | string;
  requestId?: string;
  sessionId?: string | null;
  userId?: string | null;
  purpose?: string | null;
  request?: Record<string, unknown>;
  pc2Output?: Record<string, unknown>;
  finalResponse?: CoachingPayload;
  modelName?: string;
  createdAt?: string | null;
};

export type CoachingPayload = {
  summary?: string;
  priority?: string;
  mirror_message?: string;
  warnings?: string[];
  pc2_payload?: {
    message?: string;
    display_lines?: string[];
    evidence?: EvidenceItem[];
  };
};

export type SessionStartResponse = {
  session_id: string;
  user_id: string;
  mode: string;
  goal: string;
  status: string;
  ws_url: string;
};

export type ExerciseUpdate = {
  session_id?: string;
  type?: string;
  count?: number;
  count_left?: number | null;
  count_right?: number | null;
  state?: string;
  feedback?: string;
  stability_score?: number;
  posture_errors?: string[];
  target_status?: string;
  measurement_quality?: string;
  measurement_confidence?: number;
  exercise?: {
    type?: string;
    count?: number;
    state?: string;
    stability_score?: number;
    posture_errors?: string[];
    target_status?: string;
    count_left?: number | null;
    count_right?: number | null;
  };
};

export type SessionFinalResponse = {
  session_id: string;
  status: string;
  features?: Record<string, unknown>;
  baseline_diff?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  coaching?: CoachingPayload;
  skip_reason?: string | null;
};

export type WorkoutRun = {
  routine: RoutineBundle;
  day: RoutineDay;
  currentIndex: number;
  results: SessionFinalResponse[];
};
