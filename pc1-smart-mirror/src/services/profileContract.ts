import type { Profile } from './api';

const GOAL_VALUES = [
  'build_stamina',
  'posture_correction',
  'lower_body_strength',
  'build_habit',
  'weight_management',
] as const;

const EXPERIENCE_VALUES = ['beginner', 'casual', 'consistent'] as const;
const FREQUENCY_VALUES = ['once_twice', 'three_four', 'five_plus'] as const;
const LIMITATION_VALUES = ['knee', 'back', 'shoulder', 'ankle'] as const;

type GoalValue = (typeof GOAL_VALUES)[number];
type ExperienceValue = (typeof EXPERIENCE_VALUES)[number];
type FrequencyValue = (typeof FREQUENCY_VALUES)[number];
type LimitationValue = (typeof LIMITATION_VALUES)[number];

export const GOAL_OPTIONS: { value: GoalValue; label: string }[] = [
  { value: 'build_stamina', label: '체력 올리기' },
  { value: 'posture_correction', label: '자세 교정' },
  { value: 'lower_body_strength', label: '하체 근력' },
  { value: 'build_habit', label: '운동 습관 만들기' },
  { value: 'weight_management', label: '체중 관리' },
];

export const EXPERIENCE_OPTIONS: { value: ExperienceValue; label: string }[] = [
  { value: 'beginner', label: '초보' },
  { value: 'casual', label: '가볍게 운동 중' },
  { value: 'consistent', label: '꾸준히 운동 중' },
];

export const FREQUENCY_OPTIONS: { value: FrequencyValue; label: string }[] = [
  { value: 'once_twice', label: '주 1~2회' },
  { value: 'three_four', label: '주 3~4회' },
  { value: 'five_plus', label: '주 5회 이상' },
];

export const LIMITATION_OPTIONS: { value: LimitationValue | 'none'; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'knee', label: '무릎' },
  { value: 'back', label: '허리/등' },
  { value: 'shoulder', label: '어깨' },
  { value: 'ankle', label: '발목' },
];

const GOAL_ALIASES: Record<string, GoalValue> = {
  upper_body_strength: 'posture_correction',
  full_body_fitness: 'build_stamina',
  endurance: 'build_stamina',
  weight_loss: 'weight_management',
  flexibility: 'posture_correction',
};

const EXPERIENCE_ALIASES: Record<string, ExperienceValue> = {
  intermediate: 'casual',
  advanced: 'consistent',
};

const FREQUENCY_ALIASES: Record<string, FrequencyValue> = {
  one_two: 'once_twice',
};

const LIMITATION_ALIASES: Record<string, LimitationValue | null> = {
  none: null,
  wrist: null,
  무릎: 'knee',
  knee: 'knee',
  허리: 'back',
  등: 'back',
  back: 'back',
  어깨: 'shoulder',
  shoulder: 'shoulder',
  발목: 'ankle',
  ankle: 'ankle',
};

function normalizeValue<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  aliases: Record<string, T>,
  fallback: T,
): T {
  const raw = String(value ?? '').trim();
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  return aliases[raw] ?? fallback;
}

function normalizeGoal(value: string | null | undefined): GoalValue {
  return normalizeValue(value, GOAL_VALUES, GOAL_ALIASES, 'build_habit');
}

function normalizeExperience(value: string | null | undefined): ExperienceValue {
  return normalizeValue(value, EXPERIENCE_VALUES, EXPERIENCE_ALIASES, 'beginner');
}

function normalizeFrequency(value: string | null | undefined): FrequencyValue {
  return normalizeValue(value, FREQUENCY_VALUES, FREQUENCY_ALIASES, 'three_four');
}

export function normalizeLimitations(values: string[] | null | undefined): LimitationValue[] {
  if (!Array.isArray(values)) return [];

  const normalized: LimitationValue[] = [];
  for (const value of values) {
    const raw = String(value ?? '').trim();
    const mapped = LIMITATION_ALIASES[raw];
    if (mapped === null) continue;
    const limitation = mapped ?? ((LIMITATION_VALUES as readonly string[]).includes(raw) ? (raw as LimitationValue) : null);
    if (limitation && !normalized.includes(limitation)) normalized.push(limitation);
  }
  return normalized;
}

export function normalizeProfileForPc3(profile: Profile): Profile {
  return {
    ...profile,
    goal: normalizeGoal(profile.goal),
    experience_level: normalizeExperience(profile.experience_level),
    weekly_frequency: normalizeFrequency(profile.weekly_frequency),
    limitations: normalizeLimitations(profile.limitations),
  };
}
