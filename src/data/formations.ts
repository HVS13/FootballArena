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
  },
  {
    id: '4-3-3',
    name: '4-3-3',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'lcm', label: 'LCM', x: 0.46, y: 0.32 },
      { id: 'cm', label: 'CM', x: 0.5, y: 0.5 },
      { id: 'rcm', label: 'RCM', x: 0.46, y: 0.68 },
      { id: 'lw', label: 'LW', x: 0.72, y: 0.18 },
      { id: 'st', label: 'ST', x: 0.76, y: 0.5 },
      { id: 'rw', label: 'RW', x: 0.72, y: 0.82 }
    ]
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'ldm', label: 'LDM', x: 0.4, y: 0.4 },
      { id: 'rdm', label: 'RDM', x: 0.4, y: 0.6 },
      { id: 'lam', label: 'LAM', x: 0.6, y: 0.25 },
      { id: 'cam', label: 'CAM', x: 0.62, y: 0.5 },
      { id: 'ram', label: 'RAM', x: 0.6, y: 0.75 },
      { id: 'st', label: 'ST', x: 0.78, y: 0.5 }
    ]
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'dm', label: 'DM', x: 0.38, y: 0.5 },
      { id: 'lm', label: 'LM', x: 0.52, y: 0.18 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.4 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.6 },
      { id: 'rm', label: 'RM', x: 0.52, y: 0.82 },
      { id: 'st', label: 'ST', x: 0.76, y: 0.5 }
    ]
  },
  {
    id: '4-4-1-1',
    name: '4-4-1-1',
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
      { id: 'ss', label: 'SS', x: 0.62, y: 0.5 },
      { id: 'st', label: 'ST', x: 0.76, y: 0.5 }
    ]
  },
  {
    id: '3-4-3',
    name: '3-4-3',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.3 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.7 },
      { id: 'lwb', label: 'LWB', x: 0.4, y: 0.15 },
      { id: 'rwb', label: 'RWB', x: 0.4, y: 0.85 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.38 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.62 },
      { id: 'lw', label: 'LW', x: 0.74, y: 0.2 },
      { id: 'st', label: 'ST', x: 0.78, y: 0.5 },
      { id: 'rw', label: 'RW', x: 0.74, y: 0.8 }
    ]
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.32 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.68 },
      { id: 'lwb', label: 'LWB', x: 0.38, y: 0.12 },
      { id: 'rwb', label: 'RWB', x: 0.38, y: 0.88 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.35 },
      { id: 'cm', label: 'CM', x: 0.54, y: 0.5 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.65 },
      { id: 'lst', label: 'LST', x: 0.74, y: 0.4 },
      { id: 'rst', label: 'RST', x: 0.74, y: 0.6 }
    ]
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lwb', label: 'LWB', x: 0.28, y: 0.12 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.3 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.7 },
      { id: 'rwb', label: 'RWB', x: 0.28, y: 0.88 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.35 },
      { id: 'cm', label: 'CM', x: 0.54, y: 0.5 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.65 },
      { id: 'lst', label: 'LST', x: 0.74, y: 0.4 },
      { id: 'rst', label: 'RST', x: 0.74, y: 0.6 }
    ]
  },
  {
    id: '4-2-2-2',
    name: '4-2-2-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'ldm', label: 'LDM', x: 0.38, y: 0.4 },
      { id: 'rdm', label: 'RDM', x: 0.38, y: 0.6 },
      { id: 'lam', label: 'LAM', x: 0.6, y: 0.35 },
      { id: 'ram', label: 'RAM', x: 0.6, y: 0.65 },
      { id: 'lst', label: 'LST', x: 0.78, y: 0.4 },
      { id: 'rst', label: 'RST', x: 0.78, y: 0.6 }
    ]
  },
  {
    id: '4-1-2-1-2',
    name: '4-1-2-1-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'dm', label: 'DM', x: 0.36, y: 0.5 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.35 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.65 },
      { id: 'cam', label: 'CAM', x: 0.66, y: 0.5 },
      { id: 'lst', label: 'LST', x: 0.78, y: 0.42 },
      { id: 'rst', label: 'RST', x: 0.78, y: 0.58 }
    ]
  },
  {
    id: '4-3-2-1',
    name: '4-3-2-1',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'lcm', label: 'LCM', x: 0.48, y: 0.32 },
      { id: 'cm', label: 'CM', x: 0.52, y: 0.5 },
      { id: 'rcm', label: 'RCM', x: 0.48, y: 0.68 },
      { id: 'lam', label: 'LAM', x: 0.66, y: 0.38 },
      { id: 'ram', label: 'RAM', x: 0.66, y: 0.62 },
      { id: 'st', label: 'ST', x: 0.8, y: 0.5 }
    ]
  },
  {
    id: '3-4-2-1',
    name: '3-4-2-1',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.3 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.7 },
      { id: 'lwb', label: 'LWB', x: 0.4, y: 0.12 },
      { id: 'rwb', label: 'RWB', x: 0.4, y: 0.88 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.38 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.62 },
      { id: 'lam', label: 'LAM', x: 0.68, y: 0.4 },
      { id: 'ram', label: 'RAM', x: 0.68, y: 0.6 },
      { id: 'st', label: 'ST', x: 0.82, y: 0.5 }
    ]
  },
  {
    id: '3-4-1-2',
    name: '3-4-1-2',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.3 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.7 },
      { id: 'lwb', label: 'LWB', x: 0.4, y: 0.12 },
      { id: 'rwb', label: 'RWB', x: 0.4, y: 0.88 },
      { id: 'lcm', label: 'LCM', x: 0.52, y: 0.38 },
      { id: 'rcm', label: 'RCM', x: 0.52, y: 0.62 },
      { id: 'cam', label: 'CAM', x: 0.66, y: 0.5 },
      { id: 'lst', label: 'LST', x: 0.8, y: 0.42 },
      { id: 'rst', label: 'RST', x: 0.8, y: 0.58 }
    ]
  },
  {
    id: '5-4-1',
    name: '5-4-1',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lwb', label: 'LWB', x: 0.28, y: 0.12 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.3 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.7 },
      { id: 'rwb', label: 'RWB', x: 0.28, y: 0.88 },
      { id: 'lm', label: 'LM', x: 0.5, y: 0.18 },
      { id: 'lcm', label: 'LCM', x: 0.5, y: 0.4 },
      { id: 'rcm', label: 'RCM', x: 0.5, y: 0.6 },
      { id: 'rm', label: 'RM', x: 0.5, y: 0.82 },
      { id: 'st', label: 'ST', x: 0.76, y: 0.5 }
    ]
  },
  {
    id: '4-2-4',
    name: '4-2-4',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lb', label: 'LB', x: 0.22, y: 0.16 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.36 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.64 },
      { id: 'rb', label: 'RB', x: 0.22, y: 0.84 },
      { id: 'lcm', label: 'LCM', x: 0.42, y: 0.4 },
      { id: 'rcm', label: 'RCM', x: 0.42, y: 0.6 },
      { id: 'lw', label: 'LW', x: 0.7, y: 0.18 },
      { id: 'lst', label: 'LST', x: 0.78, y: 0.4 },
      { id: 'rst', label: 'RST', x: 0.78, y: 0.6 },
      { id: 'rw', label: 'RW', x: 0.7, y: 0.82 }
    ]
  },
  {
    id: '3-2-2-3',
    name: '3-2-2-3',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.32 },
      { id: 'cb', label: 'CB', x: 0.22, y: 0.5 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.68 },
      { id: 'ldm', label: 'LDM', x: 0.4, y: 0.4 },
      { id: 'rdm', label: 'RDM', x: 0.4, y: 0.6 },
      { id: 'lam', label: 'LAM', x: 0.56, y: 0.4 },
      { id: 'ram', label: 'RAM', x: 0.56, y: 0.6 },
      { id: 'lw', label: 'LW', x: 0.74, y: 0.2 },
      { id: 'st', label: 'ST', x: 0.78, y: 0.5 },
      { id: 'rw', label: 'RW', x: 0.74, y: 0.8 }
    ]
  },
  {
    id: '2-3-5',
    name: '2-3-5',
    slots: [
      { id: 'gk', label: 'GK', x: 0.08, y: 0.5 },
      { id: 'lcb', label: 'LCB', x: 0.22, y: 0.35 },
      { id: 'rcb', label: 'RCB', x: 0.22, y: 0.65 },
      { id: 'ldm', label: 'LDM', x: 0.38, y: 0.3 },
      { id: 'cm', label: 'CM', x: 0.4, y: 0.5 },
      { id: 'rdm', label: 'RDM', x: 0.38, y: 0.7 },
      { id: 'lw', label: 'LW', x: 0.64, y: 0.15 },
      { id: 'lam', label: 'LAM', x: 0.66, y: 0.35 },
      { id: 'st', label: 'ST', x: 0.7, y: 0.5 },
      { id: 'ram', label: 'RAM', x: 0.66, y: 0.65 },
      { id: 'rw', label: 'RW', x: 0.64, y: 0.85 }
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
