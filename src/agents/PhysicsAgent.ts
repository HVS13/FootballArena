import { DEFAULT_PITCH, SimulationState } from '../domain/simulationTypes';

type PhysicsConfig = {
  pitchWidth?: number;
  pitchHeight?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const length = (x: number, y: number) => Math.hypot(x, y);

const normalize = (x: number, y: number) => {
  const len = length(x, y) || 1;
  return { x: x / len, y: y / len };
};

const moveTowards = (current: number, target: number, maxDelta: number) => {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
};

export class PhysicsAgent {
  private pitchWidth: number;
  private pitchHeight: number;

  constructor(config: PhysicsConfig = {}) {
    this.pitchWidth = config.pitchWidth ?? DEFAULT_PITCH.width;
    this.pitchHeight = config.pitchHeight ?? DEFAULT_PITCH.height;
  }

  step(state: SimulationState, dt: number) {
    this.updatePlayers(state, dt);
    this.updateBall(state, dt);
    this.updateOfficials(state, dt);
  }

  private updatePlayers(state: SimulationState, dt: number) {
    const maxSpeed = 6;
    const accel = 12;
    const wanderRadius = 4;

    for (const player of state.players) {
      player.targetTimer -= dt;
      if (player.targetTimer <= 0) {
        player.targetTimer = 2 + Math.random() * 3;
        player.targetPosition = {
          x: clamp(
            player.homePosition.x + (Math.random() * 2 - 1) * wanderRadius,
            player.radius,
            this.pitchWidth - player.radius
          ),
          y: clamp(
            player.homePosition.y + (Math.random() * 2 - 1) * wanderRadius,
            player.radius,
            this.pitchHeight - player.radius
          )
        };
      }

      const toTargetX = player.targetPosition.x - player.position.x;
      const toTargetY = player.targetPosition.y - player.position.y;
      const distance = length(toTargetX, toTargetY);
      const desiredSpeed = distance > 0.5 ? maxSpeed : 0;
      const dir = distance > 0 ? normalize(toTargetX, toTargetY) : { x: 0, y: 0 };
      const desiredVelX = dir.x * desiredSpeed;
      const desiredVelY = dir.y * desiredSpeed;

      player.velocity.x = moveTowards(player.velocity.x, desiredVelX, accel * dt);
      player.velocity.y = moveTowards(player.velocity.y, desiredVelY, accel * dt);

      player.position.x = clamp(
        player.position.x + player.velocity.x * dt,
        player.radius,
        this.pitchWidth - player.radius
      );
      player.position.y = clamp(
        player.position.y + player.velocity.y * dt,
        player.radius,
        this.pitchHeight - player.radius
      );
    }
  }

  private updateBall(state: SimulationState, dt: number) {
    const friction = 0.98;
    const bounce = 0.75;

    state.ball.position.x += state.ball.velocity.x * dt;
    state.ball.position.y += state.ball.velocity.y * dt;

    if (state.ball.position.x <= state.ball.radius || state.ball.position.x >= this.pitchWidth - state.ball.radius) {
      state.ball.velocity.x *= -bounce;
      state.ball.position.x = clamp(
        state.ball.position.x,
        state.ball.radius,
        this.pitchWidth - state.ball.radius
      );
    }

    if (state.ball.position.y <= state.ball.radius || state.ball.position.y >= this.pitchHeight - state.ball.radius) {
      state.ball.velocity.y *= -bounce;
      state.ball.position.y = clamp(
        state.ball.position.y,
        state.ball.radius,
        this.pitchHeight - state.ball.radius
      );
    }

    state.ball.velocity.x *= friction;
    state.ball.velocity.y *= friction;

    if (Math.abs(state.ball.velocity.x) < 0.02) state.ball.velocity.x = 0;
    if (Math.abs(state.ball.velocity.y) < 0.02) state.ball.velocity.y = 0;
  }

  private updateOfficials(state: SimulationState, dt: number) {
    const pace = 2;
    for (const official of state.officials) {
      const dx = state.ball.position.x - official.position.x;
      const dy = state.ball.position.y - official.position.y;
      const dir = normalize(dx, dy);
      official.position.x = clamp(
        official.position.x + dir.x * pace * dt,
        1,
        this.pitchWidth - 1
      );
      official.position.y = clamp(
        official.position.y + dir.y * pace * dt,
        1,
        this.pitchHeight - 1
      );
    }
  }
}
