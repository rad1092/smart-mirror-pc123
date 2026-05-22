export type SafetyLevel = "danger" | "caution" | "safe" | "neutral";

const DANGER_KEYWORDS = ["통증", "어지러움", "불편", "중단", "멈추", "위험"];

const RAW_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bknee[_\s-]?raise\b/gi, "니 레이즈"],
  [/\bsquat\b/gi, "스쿼트"],
  [/\bjumping[_\s-]?jack\b/gi, "점핑잭"],
  [/\blunge\b/gi, "런지"],
  [/\bpush[_\s-]?up\b/gi, "푸시업"],
  [/\bpartial[_\s-]?body\b/gi, "몸 일부만 인식"],
  [/\blow[_\s-]?quality\b/gi, "인식 품질 낮음"],
  [/\blow[_\s-]?confidence\b/gi, "인식 신뢰도 낮음"],
  [/\bpc2[_\s-]?ready\b/gi, "측정 완료"],
  [/\bpost[_\s-]?workout\b/gi, "운동 후 피드백"],
  [/\bcommon[_\s-]?error(s)?\b/gi, "흔한 실수"],
  [/\bform[_\s-]?basics\b/gi, "기본 자세"],
  [/\bprogression\b/gi, "강도 조절"],
  [/\bsafety\b/gi, "안전"],
  [/\bposture\b/gi, "자세"],
  [/\bbalance\b/gi, "균형"],
];

function polishText(value: unknown): string {
  let text = String(value ?? "").trim();
  for (const [pattern, replacement] of RAW_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function hasDangerKeyword(value: string): boolean {
  return DANGER_KEYWORDS.some((keyword) => value.includes(keyword));
}

function isGenericSafetyLine(value: string): boolean {
  return /주의|중단|멈추|통증|어지러움|불편|지원|받으세요/.test(value);
}

function uniqueLines(values: string[], limit = 4): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = polishText(value);
    if (!text || seen.has(text) || isGenericSafetyLine(text)) {
      return;
    }
    seen.add(text);
    result.push(text);
  });
  return result.slice(0, limit);
}

export function resolveSafetyLevel({
  warnings,
  stability,
  measurementQuality,
}: {
  warnings?: string[];
  stability?: number | null;
  measurementQuality?: string;
}): SafetyLevel {
  const warningText = (warnings ?? []).join(" ");
  if (hasDangerKeyword(warningText) || (measurementQuality?.includes("낮") && (warnings?.length ?? 0) >= 1)) {
    return "danger";
  }
  if ((warnings?.length ?? 0) >= 1 || (stability != null && stability < 0.5)) {
    return "caution";
  }
  if ((warnings?.length ?? 0) === 0 && stability != null && stability >= 0.7) {
    return "safe";
  }
  return "neutral";
}

export function composePositiveLine(level: SafetyLevel, exerciseLabel: string, stabilityPercent?: number | null): string {
  if (level === "safe") {
    return stabilityPercent == null ? "자세 흐름이 안정적이었습니다." : `자세 안정도 ${stabilityPercent}%로 잘 마무리했어요.`;
  }
  if (level === "caution") {
    return `${exerciseLabel} 동작을 완료했어요. 다음에는 리듬을 조금 더 천천히 맞춰봐요.`;
  }
  if (level === "danger") {
    return `${exerciseLabel} 기록을 저장했어요.`;
  }
  return `${exerciseLabel} 운동을 마쳤어요.`;
}

export function composeImprovementLines(displayLines: string[], warnings: string[], level: SafetyLevel): string[] {
  const sourceLines = level === "danger" ? displayLines : [...displayLines, ...warnings];
  const lines = uniqueLines(sourceLines);
  if (lines.length) {
    return lines;
  }
  if (level === "safe") {
    return ["지금처럼 자세를 안정적으로 유지해보세요."];
  }
  if (level === "caution") {
    return ["다음 세트에서는 속도를 조금 낮추고 자세를 먼저 맞춰보세요."];
  }
  return ["다음 운동도 같은 리듬으로 이어가면 좋아요."];
}

export function composeCoachLogTitle(log: {
  purpose?: string | null;
  finalResponse?: { summary?: string | null; mirror_message?: string | null } | null;
  pc2Output?: { summary?: string | null; message?: string | null } | null;
}): string {
  return polishText(log.finalResponse?.summary ?? log.finalResponse?.mirror_message ?? log.pc2Output?.summary ?? log.pc2Output?.message ?? "코칭 기록");
}

export function composeCoachLogBody(log: {
  purpose?: string | null;
  createdAt?: string | null;
  finalResponse?: { warnings?: string[] | null; pc2_payload?: { display_lines?: string[] | null } | null } | null;
  pc2Output?: { summary?: string | null; display_lines?: string[] | null } | null;
}): string | null {
  const time = log.createdAt?.slice(11, 16);
  const lines = uniqueLines([...(log.finalResponse?.pc2_payload?.display_lines ?? []), ...(log.pc2Output?.display_lines ?? []), log.pc2Output?.summary ?? ""], 1);
  return [time, lines[0]].filter(Boolean).join(" · ") || null;
}
