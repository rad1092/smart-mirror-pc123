import type { ExerciseType } from "../types/domain";

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  squat: "스쿼트",
  jumping_jack: "점핑잭",
  knee_raise: "니 레이즈",
  lunge: "런지",
  pushup: "푸시업",
};

export const GOAL_OPTIONS = [
  { value: "build_stamina", label: "체력 올리기" },
  { value: "posture_correction", label: "자세 교정" },
  { value: "lower_body_strength", label: "하체 근력" },
  { value: "build_habit", label: "운동 습관 만들기" },
  { value: "weight_management", label: "체중 관리" },
] as const;

export const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "초보" },
  { value: "casual", label: "가볍게 운동 중" },
  { value: "consistent", label: "꾸준히 운동 중" },
] as const;

export const FREQUENCY_OPTIONS = [
  { value: "once_twice", label: "주 1-2회" },
  { value: "three_four", label: "주 3-4회" },
  { value: "five_plus", label: "주 5회 이상" },
] as const;

export const LIMITATION_OPTIONS = [
  { value: "knee", label: "무릎" },
  { value: "back", label: "허리/등" },
  { value: "shoulder", label: "어깨" },
  { value: "ankle", label: "발목" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  posture: "자세",
  balance: "균형",
  stability: "안정도",
  rhythm: "리듬",
  strength: "근력",
  cardio: "심폐",
  mobility: "가동성",
  safety: "안전",
  routine: "루틴",
  history: "운동 이력",
  skip: "건너뛰기",
  exercise: "운동",
  post_workout: "운동 후 피드백",
  postworkout: "운동 후 피드백",
  common_error: "흔한 실수",
  common_errors: "흔한 실수",
  form_basics: "기본 자세",
  progression: "강도 조절",
};

const ADJUSTMENT_LABELS: Record<string, string> = {
  hold: "유지",
  increase: "증가",
  decrease: "감소",
  hold_or_decrease: "유지 또는 감소",
};

const POSTURE_ERROR_LABELS: Record<string, string> = {
  partial_range: "동작 범위 부족",
  partial_body: "몸 일부만 인식",
  partial_body_detected: "몸 일부만 인식",
  body_partial: "몸 일부만 인식",
  full_body_missing: "전신 인식 필요",
  upper_body_only: "상체만 인식됨",
  lower_body_only: "하체만 인식됨",
  no_full_body: "전신 인식 필요",
  knee_valgus: "무릎 안쪽 무너짐",
  knee_inward: "무릎 안쪽 이동",
  back_rounding: "등 말림",
  rounded_back: "등 말림",
  torso_lean: "상체 기울어짐",
  unstable_balance: "균형 불안정",
  fast_tempo: "속도 빠름",
  shallow_depth: "깊이 부족",
  arm_position: "팔 위치 불안정",
  low_confidence: "인식 신뢰도 낮음",
  fast_only: "속도가 너무 빨라요",
  too_fast: "속도가 너무 빨라요",
  target_recovering: "대상 재인식 중",
  multi_person_detected: "여러 사람 감지됨",
  target_lost: "대상 놓침",
};

const TARGET_STATUS_LABELS: Record<string, string> = {
  idle: "대기",
  tracking: "추적 중",
  target_ready: "인식 완료",
  target_recovering: "자세 재확인 중",
  target_lost: "대상 놓침",
  multi_person_detected: "여러 사람 감지",
};

const COACH_PURPOSE_LABELS: Record<string, string> = {
  exercise_feedback: "운동 피드백",
  balance_feedback: "균형 피드백",
  pre_exercise_routine: "운동 전 루틴",
  post_exercise_coaching: "운동 후 코칭",
};

const MEASUREMENT_QUALITY_LABELS: Record<string, string> = {
  pc2_ready: "측정 완료",
  ready: "측정 완료",
  good: "좋음",
  low_quality: "인식 품질 낮음",
  low_confidence: "인식 신뢰도 낮음",
  partial_body: "몸 일부만 인식",
  partial_body_detected: "몸 일부만 인식",
  body_partial: "몸 일부만 인식",
  no_pose: "자세 미인식",
  no_full_body: "전신 인식 필요",
};

function humanizeFallback(value: string): string {
  const text = value.replace(/_/g, " ").trim();
  return /[A-Za-z]/.test(text) ? "확인 필요" : text;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function formatExerciseName(value?: string | null): string {
  if (!value) {
    return "";
  }
  return EXERCISE_LABELS[value as ExerciseType] ?? humanizeFallback(value);
}

export function formatCategoryLabel(value?: string | null): string {
  if (!value) {
    return "";
  }
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_LABELS[value] ?? CATEGORY_LABELS[normalized] ?? humanizeFallback(value);
}

export function formatEvidenceMeta(exercise?: string | null, category?: string | null): string {
  return [formatExerciseName(exercise), formatCategoryLabel(category)].filter(Boolean).join(" · ");
}

export function formatAdjustmentDirection(value?: string | null): string {
  if (!value) {
    return "";
  }
  return ADJUSTMENT_LABELS[value] ?? humanizeFallback(value);
}

export function formatPostureError(value: string): string {
  const normalized = normalizeLookupKey(value);
  return POSTURE_ERROR_LABELS[value] ?? POSTURE_ERROR_LABELS[normalized] ?? humanizeFallback(value);
}

export function formatTargetStatus(value: string): string {
  const normalized = normalizeLookupKey(value);
  return TARGET_STATUS_LABELS[value] ?? TARGET_STATUS_LABELS[normalized] ?? humanizeFallback(value);
}

export function formatCoachPurpose(value?: string | null): string {
  if (!value) {
    return "";
  }
  return COACH_PURPOSE_LABELS[value] ?? humanizeFallback(value);
}

export function formatMeasurementQuality(value?: string | null): string {
  if (!value) {
    return "기록 없음";
  }
  const normalized = normalizeLookupKey(value);
  return MEASUREMENT_QUALITY_LABELS[value] ?? MEASUREMENT_QUALITY_LABELS[normalized] ?? humanizeFallback(value);
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function offsetDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function monthStartIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  if (!year || !month) {
    return isoDate;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthEndIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  if (!year || !month) {
    return isoDate;
  }
  const date = new Date(year, month, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function shortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : isoDate;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) {
    return "0분";
  }
  return `${Math.round(seconds / 60)}분`;
}

export function formatWeightDelta(delta: number | null): string {
  if (delta === null) {
    return "기록 부족";
  }
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}kg`;
}

export function formatExerciseTarget(reps: number | null, durationSec: number | null): string {
  if (typeof reps === "number" && reps > 0) {
    return `${reps}회`;
  }
  if (typeof durationSec === "number" && durationSec > 0) {
    return `${durationSec}초`;
  }
  return "목표 조정";
}

export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
