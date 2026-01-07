import { LineupSlot } from '../domain/teamSetupTypes';

export type FormationSlot = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type Formation = {
  id: string;
  name: string;
  slots: FormationSlot[];
};

export const FORMATIONS: Formation[] = [
  {
    id: '4-4-2',
    name: '4-4-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.18 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.4 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.6 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.82 },
      { id: 'lm', label: 'LM', x: 0.45, y: 0.18 },
      { id: 'lcm', label: 'LCM', x: 0.45, y: 0.4 },
      { id: 'rcm', label: 'RCM', x: 0.45, y: 0.6 },
      { id: 'rm', label: 'RM', x: 0.45, y: 0.82 },
      { id: 'lst', label: 'LST', x: 0.7, y: 0.35 },
      { id: 'rst', label: 'RST', x: 0.7, y: 0.65 }
    ]
  }
];

export const buildLineupSlots = (formation: Formation, mirror = false): LineupSlot[] => {
  return formation.slots.map((slot) => {
    const x = mirror ? 1 - slot.x : slot.x;
    return {
      id: slot.id,
      label: slot.label,
      position: { x, y: slot.y },
      playerId: null,
      roleId: null,
      dutyId: null
    };
  });
};
