export const TUNING = {
  version: 'local-v0.1.0',
  match: {
    actionCooldownMultiplier: 3.5,
    passChanceFloor: 0.79,
    passChanceCeiling: 0.94,
    interceptionChanceMultiplier: 0.2,
    offsideTargetScoreMultiplier: 0.03,
    parryToCornerChance: 0.18,
    fallbackSaveToCornerChance: 0.2
  },
  timing: {
    defensiveChallengeIntervalSeconds: 0.2
  },
  discipline: {
    foulBaseChance: 0.015,
    foulChanceMultiplier: 0.65,
    contestFoulChanceMultiplier: 0.55,
    contestTackleChanceMultiplier: 0.22,
    yellowBaseChance: 0.04,
    yellowSeverityScale: 0.16,
    redBaseChance: 0.005,
    redSeverityScale: 0.02
  },
  pressure: {
    baseDistance: 6,
    minDistance: 3.5,
    maxDistance: 8
  },
  press: {
    engageBase: 2.8,
    engageMin: 2.6,
    engageMax: 4.6,
    attemptBase: 0.04,
    attemptMax: 0.5
  },
  control: {
    baseDistance: 2.2,
    maxDistance: 3.8,
    baseSpeed: 3.2,
    maxSpeed: 8.5
  },
  block: {
    baseMaxDistance: 4.2,
    minDistance: 3.2,
    maxDistance: 5.2
  },
  line: {
    engagementAxis: {
      high: 62,
      mid: 52,
      low: 42
    },
    defensiveAxis: {
      deeper: 22,
      standard: 27,
      higher: 32,
      muchHigher: 38
    },
    speedShift: 4,
    positioningShift: 2
  },
  setPiece: {
    corner: {
      baseX: 6,
      farX: 9,
      edgeX: 18,
      nearYOffset: 4.5,
      farYOffset: 4.5,
      swingOut: 1.2,
      swingIn: 0.4
    },
    freeKick: {
      baseX: 8,
      nearYOffset: 4,
      farYOffset: 4,
      swingOut: 1.4,
      swingIn: 0.4
    },
    wall: {
      distance: 8,
      spacing: 1.6
    },
    recovery: {
      baseOffsetX: 14,
      offsetShort: 8,
      offsetWide: 12
    },
    outlet: {
      baseOffsetX: 8,
      laneOffset: 8
    },
    zones: {
      x: 4.5,
      yOffset: 3
    }
  },
  physics: {
    spinAccel: 0.08,
    spinDecay: 0.985,
    spinMax: 1.2,
    passSpeedBase: 7,
    passSpeedSkillScale: 6,
    shotSpeedBase: 14,
    shotSpeedSkillScale: 10,
    powerToFriction: 0.01
  }
};
