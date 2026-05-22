const STORAGE_PREFIX = "smart-mirror.pc1.dayNotes";

type DayNotes = Record<string, string>;

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}:${profileId}`;
}

function readAll(profileId: string): DayNotes {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as DayNotes) : {};
  } catch {
    return {};
  }
}

export function readDayNotes(profileId: string): DayNotes {
  return readAll(profileId);
}

export function readDayNote(profileId: string, date: string): string {
  return readAll(profileId)[date] ?? "";
}

export function saveDayNote(profileId: string, date: string, note: string): DayNotes {
  const notes = readAll(profileId);
  const trimmed = note.trim();
  if (trimmed) {
    notes[date] = note.slice(0, 240);
  } else {
    delete notes[date];
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(notes));
  }
  return notes;
}

export function dayNotePreview(note: string, maxLength = 12): string {
  const compact = note.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  return compact.length > maxLength ? `${compact.slice(0, Math.max(0, maxLength - 1)).trim()}…` : compact;
}
