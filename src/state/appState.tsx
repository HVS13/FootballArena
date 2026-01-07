import React, { createContext, useContext, useMemo, useReducer } from 'react';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';
import { TeamSetupState } from '../domain/teamSetupTypes';

type Phase = 'setup' | 'match';

type AppState = {
  phase: Phase;
  simSpeed: number;
  isPaused: boolean;
  teamSetup: TeamSetupState | null;
  environment: EnvironmentState;
};

type AppAction =
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_TEAM_SETUP'; teamSetup: TeamSetupState | null }
  | { type: 'SET_ENVIRONMENT'; environment: EnvironmentState };

const initialState: AppState = {
  phase: 'setup',
  simSpeed: 2,
  isPaused: false,
  teamSetup: null,
  environment: DEFAULT_ENVIRONMENT
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
    default:
      return state;
  }
};

const AppStateContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
};
