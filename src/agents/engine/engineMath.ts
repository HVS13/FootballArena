import { RenderState, SimulationState } from '../../domain/simulationTypes';

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const cloneState = (state: SimulationState): SimulationState => ({
  time: state.time,
  teams: state.teams.map((team) => ({ ...team })),
  players: state.players.map((player) => ({
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    homePosition: { ...player.homePosition },
    targetPosition: { ...player.targetPosition },
    tacticalPosition: player.tacticalPosition ? { ...player.tacticalPosition } : undefined,
    attributes: player.attributes ? { ...player.attributes } : undefined,
    playstyles: player.playstyles ? [...player.playstyles] : undefined,
    playstylesPlus: player.playstylesPlus ? [...player.playstylesPlus] : undefined,
    traits: player.traits ? [...player.traits] : undefined,
    roleId: player.roleId ?? null,
    dutyId: player.dutyId ?? null,
    tacticalWander: player.tacticalWander,
    morale: player.morale,
    injury: player.injury ? { ...player.injury } : null,
    fatigue: player.fatigue,
    discipline: player.discipline ? { ...player.discipline } : { yellow: 0, red: false }
  })),
  ball: {
    ...state.ball,
    position: { ...state.ball.position },
    velocity: { ...state.ball.velocity }
  },
  officials: state.officials.map((official) => ({
    ...official,
    position: { ...official.position }
  }))
});

export const interpolateState = (prev: SimulationState, next: SimulationState, alpha: number): RenderState => ({
  time: lerp(prev.time, next.time, alpha),
  teams: next.teams,
  players: next.players.map((player, index) => ({
    ...player,
    position: {
      x: lerp(prev.players[index].position.x, player.position.x, alpha),
      y: lerp(prev.players[index].position.y, player.position.y, alpha)
    },
    velocity: { ...player.velocity }
  })),
  ball: {
    ...next.ball,
    position: {
      x: lerp(prev.ball.position.x, next.ball.position.x, alpha),
      y: lerp(prev.ball.position.y, next.ball.position.y, alpha)
    },
    velocity: { ...next.ball.velocity }
  },
  officials: next.officials.map((official, index) => ({
    ...official,
    position: {
      x: lerp(prev.officials[index].position.x, official.position.x, alpha),
      y: lerp(prev.officials[index].position.y, official.position.y, alpha)
    }
  }))
});
