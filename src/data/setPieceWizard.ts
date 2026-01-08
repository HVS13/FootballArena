export type SetPieceWizardSettings = {
  markingSystem: 'zonal' | 'player' | 'hybrid';
  postCoverage: 'both_posts' | 'near_post' | 'no_posts';
  defensivePosture: 'defend_box' | 'balanced' | 'counter_attack';
  deliveryTarget: 'near_post' | 'centre' | 'far_post';
  numbersCommitted: 'defend_transition' | 'balanced' | 'stay_high';
  deliverySwing: 'inswinger' | 'outswinger';
};

export const DEFAULT_SET_PIECE_SETTINGS: SetPieceWizardSettings = {
  markingSystem: 'hybrid',
  postCoverage: 'both_posts',
  defensivePosture: 'balanced',
  deliveryTarget: 'centre',
  numbersCommitted: 'balanced',
  deliverySwing: 'inswinger'
};

export const SET_PIECE_WIZARD_QUESTIONS = [
  {
    id: 'markingSystem',
    name: 'Marking System',
    description:
      'Zonal protects key areas, player marking relies on matchups, hybrid mixes both.',
    options: [
      { id: 'zonal', name: 'Zonal' },
      { id: 'player', name: 'Player' },
      { id: 'hybrid', name: 'Hybrid' }
    ]
  },
  {
    id: 'postCoverage',
    name: 'Post Coverage',
    description:
      'Both posts covers the goalmouth, near post focuses on the first ball, no posts maximizes marking.',
    options: [
      { id: 'both_posts', name: 'Both Posts' },
      { id: 'near_post', name: 'Near Post' },
      { id: 'no_posts', name: 'No Posts' }
    ]
  },
  {
    id: 'defensivePosture',
    name: 'Defensive Posture',
    description:
      'Defend box stays compact, counter attack leaves outlets high, balanced splits the difference.',
    options: [
      { id: 'defend_box', name: 'Defend Box' },
      { id: 'balanced', name: 'Balanced' },
      { id: 'counter_attack', name: 'Counter Attack' }
    ]
  },
  {
    id: 'deliveryTarget',
    name: 'Delivery Target',
    description: 'Near post is quick, centre suits collective height, far post favors a main aerial target.',
    options: [
      { id: 'near_post', name: 'Near Post' },
      { id: 'centre', name: 'Centre' },
      { id: 'far_post', name: 'Far Post' }
    ]
  },
  {
    id: 'numbersCommitted',
    name: 'Numbers Committed',
    description:
      'Defend transition keeps players back, stay high commits numbers, balanced sits between.',
    options: [
      { id: 'defend_transition', name: 'Defend Transition' },
      { id: 'balanced', name: 'Balanced' },
      { id: 'stay_high', name: 'Stay High' }
    ]
  },
  {
    id: 'deliverySwing',
    name: 'Delivery Swing',
    description: 'Inswingers favor direct headers, outswingers are harder to claim but less direct.',
    options: [
      { id: 'inswinger', name: 'Inswinger' },
      { id: 'outswinger', name: 'Outswinger' }
    ]
  }
] as const;
