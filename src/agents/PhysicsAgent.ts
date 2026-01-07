import { DEFAULT_PITCH, PlayerState, SimulationState } from '../domain/simulationTypes';
import { DEFAULT_ENVIRONMENT, EnvironmentState } from '../domain/environmentTypes';

type PhysicsConfig = {
  pitchWidth?: number;
  pitchHeight?: number;
  environment?: EnvironmentState;
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

const getAttribute = (player: PlayerState, id: string, fallback = 50) => player.attributes?.[id] ?? fallback;

const playstyleMultiplier = (player: PlayerState, id: string, standard: number, plus: number) => {
  if (player.playstylesPlus?.includes(id)) return plus;
  if (player.playstyles?.includes(id)) return standard;
  return 1;
};

export class PhysicsAgent {
  private pitchWidth: number;
  private pitchHeight: number;
  private environment: EnvironmentState;

  constructor(config: PhysicsConfig = {}) {
    this.pitchWidth = config.pitchWidth ?? DEFAULT_PITCH.width;
    this.pitchHeight = config.pitchHeight ?? DEFAULT_PITCH.height;
    this.environment = config.environment ?? DEFAULT_ENVIRONMENT;
  }

  setEnvironment(environment: EnvironmentState) {
    this.environment = environment;
  }

  step(state: SimulationState, dt: number) {
    this.updatePlayers(state, dt);
    this.updateBall(state, dt);
    this.updateOfficials(state, dt);
  }

  private updatePlayers(state: SimulationState, dt: number) {
    const env = this.getEnvironmentModifiers();
    for (const player of state.players) {
      const pace = getAttribute(player, 'pace');
      const acceleration = getAttribute(player, 'acceleration');
      const agility = getAttribute(player, 'agility');
      const stamina = getAttribute(player, 'stamina');

      let maxSpeed = (4 + (pace / 100) * 4) * env.speedFactor;
      let accel = (8 + (acceleration / 100) * 8) * env.accelFactor;
      const agilityFactor = 0.8 + (agility / 100) * 0.4;

      const matchProgress = Math.min(state.time / 5400, 1);
      let staminaPenalty = (1 - stamina / 100) * 0.35 * matchProgress * env.fatigueFactor;
      staminaPenalty *= playstyleMultiplier(player, 'relentless', 0.85, 0.7);
      const staminaFactor = 1 - staminaPenalty;

      maxSpeed *= staminaFactor;
      accel *= staminaFactor;

      maxSpeed *= playstyleMultiplier(player, 'rapid', 1.08, 1.16);
      accel *= playstyleMultiplier(player, 'quick_step', 1.08, 1.16);
      maxSpeed *= playstyleMultiplier(player, 'technical', 1.03, 1.07);
      accel *= playstyleMultiplier(player, 'technical', 1.03, 1.07);

      const wanderRadius = 3.5 * agilityFactor;

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
    const env = this.getEnvironmentModifiers();
    const friction = env.friction;
    const bounce = env.bounce;

    state.ball.velocity.x += env.wind.x * dt;
    state.ball.velocity.y += env.wind.y * dt;

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

  private getEnvironmentModifiers() {
    const { weather, pitch, temperatureC, wind } = this.environment;
    let friction = 0.98;
    let bounce = 0.75;
    let speedFactor = 1;
    let accelFactor = 1;

    if (pitch === 'pristine') {
      friction = 0.985;
      bounce = 0.78;
      speedFactor = 1.02;
    } else if (pitch === 'worn') {
      friction = 0.97;
      bounce = 0.7;
      speedFactor = 0.98;
      accelFactor = 0.97;
    } else if (pitch === 'heavy') {
      friction = 0.95;
      bounce = 0.65;
      speedFactor = 0.94;
      accelFactor = 0.92;
    }

    if (weather === 'rain') {
      friction = Math.min(0.995, friction + 0.01);
      bounce = Math.max(0.6, bounce - 0.03);
      accelFactor *= 0.96;
    } else if (weather === 'snow') {
      friction = Math.max(0.92, friction - 0.02);
      bounce = Math.max(0.55, bounce - 0.05);
      speedFactor *= 0.93;
      accelFactor *= 0.9;
    } else if (weather === 'storm') {
      friction = Math.min(0.995, friction + 0.015);
      bounce = Math.max(0.58, bounce - 0.04);
      accelFactor *= 0.94;
    }

    const heatPenalty = temperatureC > 22 ? (temperatureC - 22) / 40 : 0;
    const coldPenalty = temperatureC < 4 ? (4 - temperatureC) / 40 : 0;
    const weatherPenalty = weather === 'rain' ? 0.05 : weather === 'snow' ? 0.1 : weather === 'storm' ? 0.12 : 0;
    const fatigueFactor = 1 + heatPenalty + coldPenalty + weatherPenalty;

    return {
      friction,
      bounce,
      speedFactor,
      accelFactor,
      fatigueFactor,
      wind: { ...wind }
    };
  }
}
