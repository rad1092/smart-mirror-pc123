import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { RoutineBundle, RoutineDay, SessionFinalResponse, UserProfile, WorkoutRun } from "../types/domain";

type AppContextValue = {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  activeProfileId: string | null;
  selectedRoutine: RoutineBundle | null;
  selectedDay: RoutineDay | null;
  workoutRun: WorkoutRun | null;
  lastResult: SessionFinalResponse | null;
  setProfiles: (profiles: UserProfile[]) => void;
  upsertProfile: (profile: UserProfile) => void;
  removeProfile: (profileId: string) => void;
  setActiveProfileId: (profileId: string | null) => void;
  setSelectedRoutine: (routine: RoutineBundle | null, day?: RoutineDay | null) => void;
  setWorkoutRun: (run: WorkoutRun | null) => void;
  setLastResult: (result: SessionFinalResponse | null) => void;
  resetWorkout: () => void;
  updateActiveProfile: (patch: Partial<UserProfile>) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const LAST_PROFILE_KEY = "smart-mirror.pc1.lastProfileId";

function readLastProfileId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LAST_PROFILE_KEY);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfilesState] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => readLastProfileId());
  const [selectedRoutineState, setSelectedRoutineState] = useState<RoutineBundle | null>(null);
  const [selectedDayState, setSelectedDayState] = useState<RoutineDay | null>(null);
  const [workoutRun, setWorkoutRun] = useState<WorkoutRun | null>(null);
  const [lastResult, setLastResult] = useState<SessionFinalResponse | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const setProfiles = useCallback((nextProfiles: UserProfile[]) => {
    setProfilesState(nextProfiles);
    setActiveProfileIdState((current) => {
      if (current && nextProfiles.some((profile) => profile.id === current)) {
        return current;
      }
      const remembered = readLastProfileId();
      if (remembered && nextProfiles.some((profile) => profile.id === remembered)) {
        return remembered;
      }
      return null;
    });
  }, []);

  const upsertProfile = useCallback((profile: UserProfile) => {
    setProfilesState((current) => [profile, ...current.filter((item) => item.id !== profile.id)]);
  }, []);

  const removeProfile = useCallback((profileId: string) => {
    setProfilesState((current) => current.filter((profile) => profile.id !== profileId));
    setActiveProfileIdState((current) => (current === profileId ? null : current));
    if (typeof window !== "undefined" && window.localStorage.getItem(LAST_PROFILE_KEY) === profileId) {
      window.localStorage.removeItem(LAST_PROFILE_KEY);
    }
  }, []);

  const setActiveProfileId = useCallback((profileId: string | null) => {
    setActiveProfileIdState(profileId);
    if (typeof window === "undefined") {
      return;
    }
    if (profileId) {
      window.localStorage.setItem(LAST_PROFILE_KEY, profileId);
    } else {
      window.localStorage.removeItem(LAST_PROFILE_KEY);
    }
  }, []);

  const setSelectedRoutine = useCallback((routine: RoutineBundle | null, day: RoutineDay | null = null) => {
    setSelectedRoutineState(routine);
    setSelectedDayState(day);
  }, []);

  const resetWorkout = useCallback(() => {
    setSelectedRoutineState(null);
    setSelectedDayState(null);
    setWorkoutRun(null);
    setLastResult(null);
  }, []);

  const updateActiveProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      if (!activeProfileId) {
        return;
      }
      setProfilesState((current) => current.map((profile) => (profile.id === activeProfileId ? { ...profile, ...patch } : profile)));
    },
    [activeProfileId],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      profiles,
      activeProfile,
      activeProfileId,
      selectedRoutine: selectedRoutineState,
      selectedDay: selectedDayState,
      workoutRun,
      lastResult,
      setProfiles,
      upsertProfile,
      removeProfile,
      setActiveProfileId,
      setSelectedRoutine,
      setWorkoutRun,
      setLastResult,
      resetWorkout,
      updateActiveProfile,
    }),
    [
      activeProfile,
      activeProfileId,
      lastResult,
      profiles,
      removeProfile,
      resetWorkout,
      selectedDayState,
      selectedRoutineState,
      setActiveProfileId,
      setProfiles,
      setSelectedRoutine,
      updateActiveProfile,
      upsertProfile,
      workoutRun,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useAppState must be used inside AppProvider");
  }
  return value;
}
