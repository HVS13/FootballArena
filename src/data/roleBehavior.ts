export type RoleBehavior = {
  advance: number;
  retreat: number;
  press: number;
  width: number;
  roam: number;
  risk: number;
  pass: number;
  shoot: number;
  carry: number;
  cross: number;
  hold: number;
};

const BASE_BEHAVIOR: RoleBehavior = {
  advance: 0.3,
  retreat: 0.3,
  press: 0.2,
  width: 0,
  roam: 0.1,
  risk: 0,
  pass: 0,
  shoot: 0,
  carry: 0,
  cross: 0,
  hold: 0.2
};

const ROLE_BEHAVIOR: Record<string, Partial<RoleBehavior>> = {
  goalkeeper: { advance: 0.05, retreat: 0.75, press: 0.05, hold: 0.7, risk: -0.1 },
  line_holding_keeper: { advance: 0, retreat: 0.85, press: 0.02, hold: 0.85, risk: -0.2 },
  no_nonsense_goalkeeper: { advance: 0.05, retreat: 0.8, press: 0.05, hold: 0.8, risk: -0.25, pass: -0.1 },
  sweeper_keeper: { advance: 0.35, retreat: 0.5, press: 0.35, roam: 0.3, risk: 0.15, pass: 0.1 },
  ball_playing_goalkeeper: { advance: 0.25, retreat: 0.6, press: 0.2, roam: 0.2, risk: 0.2, pass: 0.2 },

  centre_back: { advance: 0.15, retreat: 0.7, press: 0.2, hold: 0.5, risk: -0.05, pass: -0.05 },
  no_nonsense_cb: { advance: 0.1, retreat: 0.8, press: 0.2, hold: 0.65, risk: -0.25, pass: -0.2, carry: -0.2 },
  covering_cb: { advance: 0.1, retreat: 0.85, press: 0.1, hold: 0.6, risk: -0.1 },
  stopping_cb: { advance: 0.2, retreat: 0.6, press: 0.45, hold: 0.35, risk: -0.05 },
  ball_playing_cb: { advance: 0.2, retreat: 0.65, press: 0.2, risk: 0.2, pass: 0.2, carry: 0.1 },
  overlapping_cb: { advance: 0.35, retreat: 0.5, press: 0.2, width: 0.2, carry: 0.15, cross: 0.1 },
  advanced_cb: { advance: 0.4, retreat: 0.5, press: 0.3, roam: 0.2, pass: 0.1 },
  wide_cb: { advance: 0.2, retreat: 0.65, press: 0.2, width: 0.35 },

  full_back: { advance: 0.35, retreat: 0.55, press: 0.25, width: 0.4, cross: 0.2, carry: 0.1 },
  holding_full_back: { advance: 0.15, retreat: 0.75, press: 0.2, hold: 0.6, width: 0.35, risk: -0.1 },
  inside_full_back: { advance: 0.25, retreat: 0.6, press: 0.25, width: -0.2, roam: 0.1, pass: 0.05 },
  inverted_full_back: { advance: 0.3, retreat: 0.6, press: 0.25, width: -0.3, roam: 0.15, pass: 0.1 },
  pressing_full_back: { advance: 0.3, retreat: 0.55, press: 0.45, width: 0.35 },

  wing_back: { advance: 0.45, retreat: 0.45, press: 0.3, width: 0.5, cross: 0.25, carry: 0.2 },
  holding_wing_back: { advance: 0.25, retreat: 0.65, press: 0.25, hold: 0.55, width: 0.45 },
  inside_wing_back: { advance: 0.35, retreat: 0.55, press: 0.3, width: -0.25, roam: 0.1, pass: 0.1 },
  inverted_wing_back: { advance: 0.35, retreat: 0.55, press: 0.3, width: -0.35, roam: 0.15, pass: 0.1 },
  pressing_wing_back: { advance: 0.4, retreat: 0.5, press: 0.5, width: 0.45 },
  playmaking_wing_back: { advance: 0.4, retreat: 0.5, press: 0.3, width: 0.35, risk: 0.15, pass: 0.2 },
  advanced_wing_back: { advance: 0.55, retreat: 0.35, press: 0.25, width: 0.55, carry: 0.2 },

  defensive_midfielder: { advance: 0.25, retreat: 0.65, press: 0.25, hold: 0.5, pass: 0.05 },
  dropping_dm: { advance: 0.15, retreat: 0.8, press: 0.15, hold: 0.7 },
  screening_dm: { advance: 0.2, retreat: 0.75, press: 0.3, hold: 0.65 },
  wide_covering_dm: { advance: 0.2, retreat: 0.7, press: 0.25, width: 0.2 },
  half_back: { advance: 0.1, retreat: 0.85, press: 0.2, hold: 0.75 },
  pressing_dm: { advance: 0.3, retreat: 0.55, press: 0.55, roam: 0.1 },
  deep_lying_playmaker: { advance: 0.3, retreat: 0.6, press: 0.2, risk: 0.15, pass: 0.25, roam: 0.1 },

  central_midfielder: { advance: 0.35, retreat: 0.5, press: 0.25, pass: 0.05 },
  screening_cm: { advance: 0.25, retreat: 0.65, press: 0.35, hold: 0.4 },
  wide_covering_cm: { advance: 0.3, retreat: 0.6, press: 0.3, width: 0.2 },
  box_to_box_midfielder: { advance: 0.45, retreat: 0.45, press: 0.35, roam: 0.2, carry: 0.15, shoot: 0.05 },
  box_to_box_playmaker: { advance: 0.45, retreat: 0.45, press: 0.35, roam: 0.25, pass: 0.2, carry: 0.1 },
  channel_midfielder: { advance: 0.4, retreat: 0.5, press: 0.25, width: 0.2, roam: 0.15, carry: 0.1 },
  midfield_playmaker: { advance: 0.4, retreat: 0.45, press: 0.2, risk: 0.2, pass: 0.3, roam: 0.2 },
  pressing_cm: { advance: 0.35, retreat: 0.5, press: 0.55, roam: 0.1 },

  wide_midfielder: { advance: 0.4, retreat: 0.5, press: 0.25, width: 0.55, cross: 0.25 },
  tracking_wide_midfielder: { advance: 0.25, retreat: 0.7, press: 0.35, width: 0.5, hold: 0.4 },
  wide_central_midfielder: { advance: 0.35, retreat: 0.55, press: 0.25, width: 0.25, roam: 0.1, pass: 0.1 },
  wide_outlet_midfielder: { advance: 0.55, retreat: 0.3, press: 0.2, width: 0.6, carry: 0.15, shoot: 0.05 },

  attacking_midfielder: { advance: 0.55, retreat: 0.3, press: 0.2, roam: 0.2, pass: 0.15, shoot: 0.15 },
  tracking_am: { advance: 0.35, retreat: 0.55, press: 0.35, pass: 0.1 },
  advanced_playmaker: { advance: 0.55, retreat: 0.3, press: 0.2, risk: 0.25, pass: 0.35, roam: 0.3 },
  central_outlet_am: { advance: 0.65, retreat: 0.2, press: 0.15, hold: 0.3, shoot: 0.2 },
  splitting_outlet_am: { advance: 0.6, retreat: 0.25, press: 0.2, width: 0.25, carry: 0.15, shoot: 0.15 },
  free_role: { advance: 0.55, retreat: 0.3, press: 0.2, roam: 0.45, risk: 0.2, pass: 0.25, shoot: 0.15 },

  winger: { advance: 0.6, retreat: 0.3, press: 0.2, width: 0.7, cross: 0.3, carry: 0.2 },
  half_space_winger: { advance: 0.55, retreat: 0.3, press: 0.2, width: -0.2, carry: 0.2, shoot: 0.15 },
  inside_winger: { advance: 0.55, retreat: 0.3, press: 0.2, width: -0.3, carry: 0.2, shoot: 0.2 },
  inverting_outlet_winger: { advance: 0.65, retreat: 0.2, press: 0.15, width: -0.25, carry: 0.2, shoot: 0.2 },
  tracking_winger: { advance: 0.35, retreat: 0.55, press: 0.35, width: 0.6 },
  wide_outlet_winger: { advance: 0.7, retreat: 0.2, press: 0.15, width: 0.75, shoot: 0.15 },
  wide_playmaker: { advance: 0.55, retreat: 0.3, press: 0.2, width: 0.5, risk: 0.2, pass: 0.3, roam: 0.2 },
  wide_forward: { advance: 0.7, retreat: 0.2, press: 0.2, width: 0.5, carry: 0.2, shoot: 0.25 },
  inside_forward: { advance: 0.7, retreat: 0.2, press: 0.2, width: -0.35, carry: 0.2, shoot: 0.3 },

  false_nine: { advance: 0.4, retreat: 0.35, press: 0.2, roam: 0.3, pass: 0.25, shoot: -0.05 },
  deep_lying_forward: { advance: 0.45, retreat: 0.3, press: 0.2, pass: 0.2, hold: 0.2 },
  half_space_forward: { advance: 0.6, retreat: 0.2, press: 0.2, width: -0.2, shoot: 0.25 },
  second_striker: { advance: 0.6, retreat: 0.25, press: 0.2, roam: 0.2, shoot: 0.2 },
  channel_forward: { advance: 0.65, retreat: 0.2, press: 0.2, width: 0.3, shoot: 0.2, carry: 0.15 },
  centre_forward: { advance: 0.6, retreat: 0.2, press: 0.2, shoot: 0.2, hold: 0.2 },
  central_outlet_cf: { advance: 0.75, retreat: 0.1, press: 0.1, hold: 0.25, shoot: 0.25 },
  splitting_outlet_cf: { advance: 0.7, retreat: 0.15, press: 0.15, width: 0.3, shoot: 0.2 },
  tracking_cf: { advance: 0.4, retreat: 0.45, press: 0.35, pass: 0.1 },
  target_forward: { advance: 0.55, retreat: 0.2, press: 0.2, hold: 0.4, shoot: 0.2, pass: 0.1 },
  poacher: { advance: 0.75, retreat: 0.1, press: 0.1, hold: 0.2, shoot: 0.35 }
};

const DUTY_BEHAVIOR: Record<string, Partial<RoleBehavior>> = {
  attack: { advance: 0.25, press: 0.15, risk: 0.15, shoot: 0.2, carry: 0.1, roam: 0.1, hold: -0.1 },
  support: { advance: 0.12, press: 0.08, risk: 0.05, shoot: 0.05, carry: 0.05, roam: 0.05 },
  defend: { retreat: 0.35, press: -0.05, risk: -0.15, shoot: -0.25, carry: -0.1, hold: 0.25 },
  stopper: { press: 0.35, advance: 0.1, retreat: 0.15, risk: -0.05, hold: -0.1 },
  cover: { retreat: 0.45, press: -0.1, risk: -0.1, hold: 0.25 },
  automatic: { advance: 0.1, retreat: 0.1, press: 0.05 }
};

const RANGE: Record<keyof RoleBehavior, [number, number]> = {
  advance: [0, 1],
  retreat: [0, 1],
  press: [0, 1],
  width: [-0.75, 0.75],
  roam: [0, 1],
  risk: [-0.4, 0.4],
  pass: [-0.3, 0.3],
  shoot: [-0.3, 0.4],
  carry: [-0.3, 0.3],
  cross: [-0.3, 0.4],
  hold: [0, 1]
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const clampBehavior = (behavior: RoleBehavior): RoleBehavior => {
  const next = { ...behavior };
  (Object.keys(RANGE) as Array<keyof RoleBehavior>).forEach((key) => {
    const [min, max] = RANGE[key];
    next[key] = clamp(next[key], min, max);
  });
  return next;
};

const applyAdjustments = (base: RoleBehavior, delta: Partial<RoleBehavior>) => {
  const next: RoleBehavior = { ...base };
  (Object.keys(delta) as Array<keyof RoleBehavior>).forEach((key) => {
    const value = delta[key];
    if (typeof value === 'number') {
      next[key] = next[key] + value;
    }
  });
  return clampBehavior(next);
};

export const getRoleDutyBehavior = (roleId?: string | null, dutyId?: string | null): RoleBehavior => {
  let behavior = applyAdjustments(BASE_BEHAVIOR, roleId ? ROLE_BEHAVIOR[roleId] ?? {} : {});
  behavior = applyAdjustments(behavior, dutyId ? DUTY_BEHAVIOR[dutyId] ?? {} : {});
  return behavior;
};
