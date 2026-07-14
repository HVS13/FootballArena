import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { TeamSetupState } from '../domain/teamSetupTypes';

type Phase = 'setup' | 'match';

type AppState = {
  phase: Phase;
  simSpeed: number;
  isPaused: boolean;
  teamSetup: TeamSetupState | null;
  environment: EnvironmentState;
  matchSeed: number | null;
};

type AppAction =
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_TEAM_SETUP'; teamSetup: TeamSetupState | null }
  | { type: 'SET_ENVIRONMENT'; environment: EnvironmentState }
  | { type: 'SET_MATCH_SEED'; seed: number | null };

const STORAGE_KEY = 'football-arena.local-setup.v1';

const defaultState: AppState = {
  phase: 'setup',
  simSpeed: 2,
  isPaused: false,
  teamSetup: null,
  environment: DEFAULT_ENVIRONMENT,
  matchSeed: null
};

const loadInitialState = (): AppState => {
  if (typeof window === 'undefined') return defaultState;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultState;
    const parsed = JSON.parse(stored) as Partial<AppState>;
    return {
      ...defaultState,
      teamSetup: parsed.teamSetup ?? null,
      environment: parsed.environment ?? DEFAULT_ENVIRONMENT,
      matchSeed: typeof parsed.matchSeed === 'number' ? parsed.matchSeed : null
    };
  } catch {
    return defaultState;
  }
};

const reducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_SPEED':
      return { ...state, simSpeed: action.speed };
    case 'SET_PAUSED':
      return { ...state, isPaused: action.paused };
    case 'SET_TEAM_SETUP':
      return { ...state, teamSetup: action.teamSetup };
    case 'SET_ENVIRONMENT':
      return { ...state, environment: action.environment };
    case 'SET_MATCH_SEED':
      return { ...state, matchSeed: action.seed };
    default:
      return state;
  }
};

const AppStateContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, teamSetup: state.teamSetup, environment: state.environment, matchSeed: state.matchSeed })
      );
    } catch {
      // Storage can be disabled. The active match remains usable in memory.
    }
  }, [state.environment, state.matchSeed, state.teamSetup]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
};
