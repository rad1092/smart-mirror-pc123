import { createContext, useContext, useState, ReactNode } from 'react';
import type { Profile, RoutineResponse, SessionStopResponse } from '../services/api';

interface AppState {
  activeProfile: Profile | null;
  baselineReady: boolean;
  routine: RoutineResponse | null;
  currentExerciseIndex: number;
  lastResult: SessionStopResponse | null;
}

interface AppContextValue extends AppState {
  setActiveProfile: (p: Profile | null) => void;
  setBaselineReady: (v: boolean) => void;
  setRoutine: (r: RoutineResponse | null) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setLastResult: (r: SessionStopResponse | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [routine, setRoutine] = useState<RoutineResponse | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [lastResult, setLastResult] = useState<SessionStopResponse | null>(null);

  return (
    <AppContext.Provider
      value={{
        activeProfile,
        setActiveProfile,
        baselineReady,
        setBaselineReady,
        routine,
        setRoutine,
        currentExerciseIndex,
        setCurrentExerciseIndex,
        lastResult,
        setLastResult,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
