import { MatchImportanceId } from '../domain/environmentTypes';

export type MatchImportanceLevel = {
  id: MatchImportanceId;
  name: string;
  weight: number;
  description: string;
};

export const MATCH_IMPORTANCE_LEVELS: MatchImportanceLevel[] = [
  {
    id: 'training',
    name: 'Training Match',
    weight: 0.75,
    description: 'Low-pressure environment focused on experimentation.'
  },
  {
    id: 'friendly',
    name: 'Friendly',
    weight: 0.85,
    description: 'Limited pressure; good for fitness and rhythm.'
  },
  {
    id: 'league',
    name: 'League Match',
    weight: 1,
    description: 'Standard competitive intensity over a long season.'
  },
  {
    id: 'cup_group',
    name: 'Cup Group Stage',
    weight: 1.05,
    description: 'Competitive but with room for error.'
  },
  {
    id: 'cup_knockout',
    name: 'Cup Knockout',
    weight: 1.12,
    description: 'Higher stakes; mistakes carry heavier consequences.'
  },
  {
    id: 'playoff',
    name: 'Playoff',
    weight: 1.15,
    description: 'Promotion or qualification pressure.'
  },
  {
    id: 'derby',
    name: 'Derby',
    weight: 1.18,
    description: 'Emotional intensity raises pressure and tempo.'
  },
  {
    id: 'semi_final',
    name: 'Semi-Final',
    weight: 1.22,
    description: 'Elite pressure with a trophy within reach.'
  },
  {
    id: 'final',
    name: 'Final',
    weight: 1.28,
    description: 'Maximum pressure environment.'
  },
  {
    id: 'relegation',
    name: 'Relegation Battle',
    weight: 1.2,
    description: 'High-stress fixtures with season-defining impact.'
  }
];

export const getMatchImportance = (id?: MatchImportanceId) =>
  MATCH_IMPORTANCE_LEVELS.find((entry) => entry.id === id) ?? MATCH_IMPORTANCE_LEVELS[2];

export const getMatchImportanceWeight = (id?: MatchImportanceId) => getMatchImportance(id).weight;
