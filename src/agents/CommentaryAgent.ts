import { CommentaryLine } from '../domain/matchTypes';
import type { RuleDecision } from './RulesAgent';

const MAX_LINES = 50;
const pick = <T,>(options: T[]) => options[Math.floor(Math.random() * options.length)];

type CommentaryContext = {
  timeSeconds: number;
  teamName: string;
  opponentName: string;
  scoreFor: number;
  scoreAgainst: number;
  scoreForBefore: number;
  scoreAgainstBefore: number;
  chanceQuality?: 'big' | 'normal';
};

type MinuteTeamSnapshot = {
  id: string;
  name: string;
  score: number;
  possessionPct: number;
  avgFatigue: number;
  avgMorale: number;
  stats: {
    possessionSeconds: number;
    passes: number;
    passesAttempted: number;
    shots: number;
    shotsOnTarget: number;
    shotsOffTarget: number;
    shotsBlocked: number;
    goals: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
    offsides: number;
    corners: number;
    tacklesWon: number;
    interceptions: number;
    saves: number;
    xg: number;
    substitutions: number;
  };
  delta: {
    possessionSeconds: number;
    passes: number;
    passesAttempted: number;
    shots: number;
    shotsOnTarget: number;
    shotsOffTarget: number;
    shotsBlocked: number;
    goals: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
    offsides: number;
    corners: number;
    tacklesWon: number;
    interceptions: number;
    saves: number;
    xg: number;
    substitutions: number;
  };
};

type MinuteSummaryContext = {
  minute: number;
  timeSeconds: number;
  home: MinuteTeamSnapshot;
  away: MinuteTeamSnapshot;
};

const GOAL_LINES = {
  normal: [
    '{player} scores for {team}.',
    '{player} finds the net for {team}.',
    '{player} finishes the move for {team}.'
  ],
  late: [
    'Late drama! {player} fires in for {team}.',
    'A huge late goal! {player} puts {team} ahead.',
    'In the closing stages, {player} delivers for {team}.'
  ],
  equalizer: [
    'Equalizer! {player} levels it for {team}.',
    '{player} brings {team} level!',
    'All square now. {player} makes it {scoreFor}-{scoreAgainst}.'
  ],
  comeback: [
    'Comeback on! {player} turns it around for {team}.',
    'What a swing! {player} puts {team} in front.',
    'The turnaround is complete. {player} scores for {team}.'
  ]
};

const SHOT_LINES = {
  saved: [
    '{player} tests the keeper.',
    '{player} forces a save.',
    'Saved! {player} goes close.'
  ],
  parried: [
    'Parried away! {player} earns a corner.',
    'The keeper palms it wide from {player}.',
    '{player} sees it pushed away.'
  ],
  blocked: [
    '{player} sees the shot blocked.',
    'A brave block denies {player}.',
    '{player} has the effort charged down.'
  ],
  missed: [
    '{player} drags the shot wide.',
    '{player} fires over the bar.',
    '{player} cannot keep it down.'
  ],
  bigMiss: [
    'Big chance missed by {player}.',
    '{player} should score there.',
    'What a chance for {player}!'
  ]
};

const PASS_LINES = {
  success: [
    '{player} keeps it moving.',
    '{player} switches the play.',
    '{player} picks out a teammate.'
  ],
  intercepted: [
    'Intercepted! {player} loses it.',
    'Cut out before it reaches the target.',
    '{player} sees the pass read.'
  ],
  miscontrol: [
    '{target} miscontrols under pressure.',
    '{target} lets it run away.',
    'A heavy touch from {target}.'
  ],
  out: [
    '{player} cannot keep it in play.',
    'That pass runs out of play.',
    '{player} overhits the pass.'
  ]
};

const FOUL_LINES = {
  foul: [
    'Foul by {player}.',
    '{player} catches the opponent late.',
    'That is a foul by {player}.'
  ],
  penalty: [
    'Penalty to {team}! {player} brings down the attacker.',
    '{team} win a penalty. {player} is the culprit.',
    'Spot kick for {team} after the challenge from {player}.'
  ],
  advantage: [
    'Advantage played for {team}.',
    'Referee waves play on for {team}.',
    '{team} play on with advantage.'
  ],
  offside: [
    'Flag up. Offside.',
    'Offside given against {player}.',
    'Too early - offside.'
  ]
};

const SET_PIECE_PASS_LINES = {
  corner: [
    '{player} swings in the corner.',
    '{player} whips the corner toward {target}.',
    '{player} delivers the corner into the mixer.'
  ],
  free_kick: [
    '{player} curls the free kick into the box.',
    '{player} lofts the free kick toward the penalty spot.',
    '{player} chips the free kick into the area.'
  ],
  throw_in: [
    '{player} takes the throw-in to {target}.',
    '{player} throws it down the line.',
    '{player} restarts with a quick throw.'
  ],
  goal_kick: [
    '{player} takes the goal kick.',
    '{player} drives the goal kick long.',
    '{player} plays it short from the goal kick.'
  ],
  kick_off: [
    '{player} taps the kickoff to {target}.',
    '{player} restarts and drops it to {target}.',
    '{player} gets us going with the kickoff.'
  ]
};

const PASS_STYLE_LINES = {
  whipped_cross: [
    '{player} whips a cross toward {target}.',
    '{player} bends a whipped delivery into the area.',
    '{player} fizzes a whipped cross across goal.'
  ],
  cross: [
    '{player} swings in a cross for {target}.',
    '{player} lifts a cross into the box.',
    '{player} floats a cross toward the far post.'
  ],
  through_ball: [
    '{player} slides a through ball for {target}.',
    '{player} threads a pass between the lines.',
    '{player} slips {target} in behind.'
  ],
  switch: [
    '{player} switches play to {target}.',
    '{player} pings it wide to {target}.',
    '{player} changes the point of attack.'
  ],
  long_ball: [
    '{player} goes long toward {target}.',
    '{player} launches a long ball forward.',
    '{player} clips it long into space.'
  ],
  short: [
    '{player} plays a short pass to {target}.',
    '{player} keeps it tidy with {target}.',
    '{player} nudges it inside to {target}.'
  ],
  one_two: [
    '{player} plays a quick one-two with {target}.',
    '{player} trades a sharp one-two.',
    '{player} bounces a pass back to {target}.'
  ],
  cutback: [
    '{player} cuts it back for {target}.',
    '{player} pulls a low cutback into the middle.',
    '{player} rolls a cutback to {target}.'
  ],
  trivela: [
    '{player} whips an outside-of-the-boot pass to {target}.',
    '{player} uses the trivela to find {target}.',
    '{player} bends an outside-foot pass inside.'
  ],
  no_look: [
    '{player} disguises a no-look pass to {target}.',
    '{player} feints and slips a no-look pass inside.',
    '{player} sells the defender and finds {target}.'
  ],
  ground: [
    '{player} drills a pass into {target}.',
    '{player} zips a ground pass forward.',
    '{player} pushes a firm pass ahead.'
  ]
};

const SHOT_STYLE_LINES = {
  finesse: {
    goal: [
      '{player} curls a finesse finish into the corner.',
      '{player} bends a beauty past the keeper.',
      '{player} guides a finesse shot home.'
    ],
    on_target: [
      '{player} curls a finesse effort on target.',
      '{player} bends one goalward.',
      '{player} sends a finesse shot toward the corner.'
    ],
    off_target: [
      '{player} curls a finesse shot wide.',
      '{player} bends it just off target.',
      '{player} sends a finesse effort past the post.'
    ],
    blocked: [
      'A finesse attempt from {player} is blocked.',
      '{player} tries to bend it, but it is blocked.',
      '{player} sees the finesse effort charged down.'
    ]
  },
  power: {
    goal: [
      '{player} smashes it in with power.',
      '{player} rifles a power shot home.',
      '{player} blasts through the keeper.'
    ],
    on_target: [
      '{player} unleashes a power drive on target.',
      '{player} hammers one toward goal.',
      '{player} lets fly with a thunderous strike.'
    ],
    off_target: [
      '{player} lashes a power shot wide.',
      '{player} blasts it over.',
      '{player} drills it beyond the post.'
    ],
    blocked: [
      '{player} hammers one, but it is blocked.',
      'A power drive from {player} is stopped.',
      '{player} sees the blast charged down.'
    ]
  },
  chip: {
    goal: [
      '{player} dinks a chip over the keeper.',
      '{player} lofts a delicate chip into the net.',
      '{player} chips the keeper and scores.'
    ],
    on_target: [
      '{player} chips the keeper and forces a stop.',
      '{player} tries the dink on target.',
      '{player} lifts a chip toward goal.'
    ],
    off_target: [
      '{player} tries to chip the keeper but misses.',
      '{player} lifts the chip over the bar.',
      '{player} sends the dink just wide.'
    ],
    blocked: [
      'The chip from {player} is blocked.',
      '{player} tries a cheeky chip, but it is stopped.',
      '{player} sees the chip cut out.'
    ]
  },
  header: {
    goal: [
      '{player} powers in a header.',
      '{player} rises and heads home.',
      '{player} nods a header into the net.'
    ],
    on_target: [
      '{player} meets it with a header on target.',
      '{player} gets a header goalward.',
      '{player} directs a header toward goal.'
    ],
    off_target: [
      '{player} heads just wide.',
      '{player} cannot steer the header on target.',
      '{player} glances the header off line.'
    ],
    blocked: [
      '{player} heads it, but it is blocked.',
      'The header from {player} is stopped.',
      '{player} sees the header charged down.'
    ]
  },
  overhead: {
    goal: [
      '{player} scores with an overhead kick.',
      '{player} lands an acrobatic overhead finish.',
      '{player} nails the overhead kick.'
    ],
    on_target: [
      '{player} attempts an overhead kick on target.',
      '{player} tries the overhead and tests the keeper.',
      '{player} goes for the overhead kick.'
    ],
    off_target: [
      '{player} attempts the overhead but misses.',
      '{player} hooks the overhead wide.',
      '{player} cannot keep the overhead down.'
    ],
    blocked: [
      '{player} tries the overhead, but it is blocked.',
      'The overhead kick from {player} is smothered.',
      '{player} sees the acrobatic effort blocked.'
    ]
  },
  trivela: {
    goal: [
      '{player} curls a trivela into the net.',
      '{player} bends an outside-of-the-boot finish home.',
      '{player} finds the corner with a trivela.'
    ],
    on_target: [
      '{player} sends a trivela effort on target.',
      '{player} whips an outside-of-the-boot shot goalward.',
      '{player} tries the trivela from there.'
    ],
    off_target: [
      '{player} curls the trivela wide.',
      '{player} sends the outside-of-the-boot effort off target.',
      '{player} cannot keep the trivela down.'
    ],
    blocked: [
      'The trivela from {player} is blocked.',
      '{player} tries the outside-of-the-boot shot, but it is stopped.',
      '{player} sees the trivela charged down.'
    ]
  },
  volley: {
    goal: [
      '{player} volleys it home.',
      '{player} smashes a volley into the net.',
      '{player} meets it on the volley and scores.'
    ],
    on_target: [
      '{player} strikes a volley on target.',
      '{player} meets it on the volley.',
      '{player} volleys toward goal.'
    ],
    off_target: [
      '{player} volleys over the bar.',
      '{player} catches the volley wide.',
      '{player} cannot keep the volley down.'
    ],
    blocked: [
      '{player} volleys, but it is blocked.',
      'The volley from {player} is stopped.',
      '{player} sees the volley charged down.'
    ]
  },
  placed: {
    goal: [
      '{player} places it into the corner.',
      '{player} guides the finish home.',
      '{player} picks out the bottom corner.'
    ],
    on_target: [
      '{player} places a shot on target.',
      '{player} guides an effort toward goal.',
      '{player} rolls a placed shot on target.'
    ],
    off_target: [
      '{player} places it just wide.',
      '{player} tries to guide it in but misses.',
      '{player} cannot find the corner.'
    ],
    blocked: [
      '{player} tries to place it, but it is blocked.',
      'The placed effort from {player} is stopped.',
      '{player} sees the guided shot blocked.'
    ]
  },
  long_range: {
    goal: [
      '{player} hits a long-range screamer.',
      '{player} buries one from distance.',
      '{player} thunders in from long range.'
    ],
    on_target: [
      '{player} tests the keeper from distance.',
      '{player} unleashes one from range on target.',
      '{player} goes for goal from long range.'
    ],
    off_target: [
      '{player} fires from distance but misses.',
      '{player} sends a long-range effort wide.',
      '{player} blazes over from range.'
    ],
    blocked: [
      'A long-range effort from {player} is blocked.',
      '{player} shoots from distance, but it is stopped.',
      '{player} sees the long-range shot charged down.'
    ]
  },
  standard: {
    goal: [
      '{player} finishes the move.',
      '{player} finds the net.',
      '{player} puts it away.'
    ],
    on_target: [
      '{player} tests the keeper.',
      '{player} forces a save.',
      '{player} hits the target.'
    ],
    off_target: [
      '{player} pulls it wide.',
      '{player} fires over the bar.',
      '{player} misses the target.'
    ],
    blocked: [
      '{player} sees the shot blocked.',
      'A brave block denies {player}.',
      '{player} has the effort charged down.'
    ]
  }
};

const KEEPER_ACTION_LINES = {
  catch: [
    '{keeper} gathers the {style}.',
    '{keeper} holds on to the {style}.',
    '{keeper} smothers the {style}.'
  ],
  parry: [
    '{keeper} parries the {style} away.',
    '{keeper} gets a strong hand to the {style}.',
    '{keeper} beats away the {style}.'
  ],
  palm: [
    '{keeper} palms the {style} wide.',
    '{keeper} pushes the {style} behind.',
    '{keeper} tips the {style} over.'
  ],
  smother: [
    '{keeper} smothers the {style} at close range.',
    '{keeper} dives to smother the {style}.',
    '{keeper} gets down to claim the {style}.'
  ]
};

const PENALTY_LINES = {
  scored: [
    '{player} buries the penalty.',
    '{player} converts from the spot.',
    '{player} sends the keeper the wrong way.'
  ],
  missed: [
    '{player} misses from the spot.',
    '{player} blazes the penalty over.',
    '{player} fails to convert the penalty.'
  ]
};

const MINUTE_SCORE_LINES = {
  level: [
    'Still level at {score}.',
    'All square between {home} and {away}.',
    'No breakthrough yet: {score}.'
  ],
  lead: [
    '{leader} lead {score}.',
    '{leader} have the edge at {score}.',
    '{leader} hold the advantage, {score}.'
  ],
  kickoff: [
    "We are underway. It's {score} between {home} and {away}.",
    'Kickoff and {home} get us started. {score} on the board.',
    'Match tempo settles early as it stays {score}.'
  ]
};

const MINUTE_TEMPO_LINES = {
  fast: [
    'High tempo, quick transitions on both sides.',
    'End-to-end spell with little time to breathe.',
    'The pace lifts as both teams trade attacks.'
  ],
  slow: [
    'A slower passage as both sides reset their shape.',
    'Patient circulation, few risks taken in this minute.',
    'A quieter spell, more probing than penetration.'
  ],
  balanced: [
    'A steady rhythm with both sides feeling each other out.',
    'Measured tempo, build-up and counter both in play.',
    'Even tempo, no side forcing the issue.'
  ]
};

const MINUTE_POSSESSION_LINES = [
  '{team} keep the ball and dictate ({possession}%).',
  '{team} are controlling possession at {possession}%.',
  '{team} see more of it, probing patiently.'
];

const MINUTE_CHANCE_LINES = {
  big: [
    '{team} carve out the better chance in that minute.',
    '{team} look the more threatening in front of goal.',
    '{team} force the defense to scramble with a real opening.'
  ],
  small: [
    '{team} show a bit more threat in the final third.',
    '{team} ask the more serious questions going forward.',
    '{team} edge the attacking exchanges.'
  ]
};

const MINUTE_DISCIPLINE_LINES = {
  yellow: [
    'A booking settles tempers for {team}.',
    'The referee reaches for yellow after the challenge by {team}.',
    '{team} walk a fine line with that caution.'
  ],
  red: [
    'Red card for {team}. That changes everything.',
    '{team} are down a player after the dismissal.',
    'A sending off swings the balance against {team}.'
  ],
  fouls: [
    'Fouls rack up as the midfield battle intensifies.',
    'The referee has plenty to do with these challenges.',
    'A scrappy minute, plenty of contact on the ball.'
  ]
};

const MINUTE_SET_PIECE_LINES = [
  '{team} win a set piece and load the box.',
  'Set pieces stacking up for {team}.',
  '{team} earn another dead-ball chance.'
];

const MINUTE_OFFSIDE_LINES = [
  'Offside flags keep stopping the forward runs.',
  'Timing is off up front, another offside call.',
  'The linesman stays busy as runs go too early.'
];

const MINUTE_FATIGUE_LINES = [
  'Legs look heavier for {team} as the minutes add up.',
  '{team} are starting to tire in this spell.',
  'Fatigue shows for {team}, the tempo drops slightly.'
];

const MINUTE_NEUTRAL_LINES = [
  'The shape holds and neither side finds a clear gap.',
  'Both teams stay organized, waiting for a mistake.',
  'A cautious minute with little separation.'
];

export class CommentaryAgent {
  private lines: CommentaryLine[] = [];

  addDecision(decision: RuleDecision, context: CommentaryContext) {
    const text = this.buildDecisionLine(decision, context);
    this.addLine(context.timeSeconds, text);
  }

  addMinuteUpdate(context: MinuteSummaryContext) {
    const text = this.buildMinuteLine(context);
    this.addLine(context.timeSeconds, text);
  }

  addLine(timeSeconds: number, text: string) {
    this.lines.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timeSeconds,
      text
    });

    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(0, MAX_LINES);
    }
  }

  getLines() {
    return this.lines;
  }

  private buildDecisionLine(decision: RuleDecision, context: CommentaryContext) {
    const minute = Math.floor(context.timeSeconds / 60);
    const scoreDiff = context.scoreFor - context.scoreAgainst;
    const isTight = Math.abs(scoreDiff) <= 1;
    const isLate = minute >= 75 && isTight;

    if (decision.type === 'goal') {
      if (decision.setPieceType === 'penalty') {
        return this.fill(pick(PENALTY_LINES.scored), decision, context);
      }
      const styleKey = decision.shotStyle ?? 'standard';
      const hasStylePool = Boolean(SHOT_STYLE_LINES[styleKey]);
      const shouldUseStyle = hasStylePool && styleKey !== 'standard' && Math.random() < 0.7;
      if (shouldUseStyle) {
        const pool = SHOT_STYLE_LINES[styleKey].goal;
        return this.fill(pick(pool), decision, context);
      }
      const wasTrailing = context.scoreForBefore < context.scoreAgainstBefore;
      const nowLevel = context.scoreFor === context.scoreAgainst;
      const nowAhead = context.scoreFor > context.scoreAgainst;

      const pool = wasTrailing && nowLevel
        ? GOAL_LINES.equalizer
        : wasTrailing && nowAhead
          ? GOAL_LINES.comeback
          : isLate
            ? GOAL_LINES.late
            : GOAL_LINES.normal;

      return this.fill(pick(pool), decision, context);
    }

    if (decision.type === 'shot') {
      return this.buildShotLine(decision, context);
    }

    if (decision.type === 'pass') {
      return this.buildPassLine(decision, context);
    }

    if (decision.type === 'out') {
      return this.fill(pick(PASS_LINES.out), decision, context);
    }

    if (decision.type === 'offside') {
      return this.fill(pick(FOUL_LINES.offside), decision, context);
    }

    if (decision.type === 'foul') {
      if (decision.advantage) {
        return this.fill(pick(FOUL_LINES.advantage), decision, context);
      }
      if (decision.restartType === 'penalty') {
        return this.fill(pick(FOUL_LINES.penalty), decision, context);
      }
      return this.fill(pick(FOUL_LINES.foul), decision, context);
    }

    return decision.commentary;
  }

  private fill(template: string, decision: RuleDecision, context: CommentaryContext) {
    return template
      .replace('{player}', decision.playerName)
      .replace('{team}', context.teamName)
      .replace('{opponent}', context.opponentName)
      .replace('{scoreFor}', String(context.scoreFor))
      .replace('{scoreAgainst}', String(context.scoreAgainst))
      .replace('{target}', decision.targetPlayerName ?? 'a teammate')
      .replace('{turnover}', decision.turnoverPlayerName ?? 'a defender')
      .replace('{keeper}', decision.keeperName ?? 'the keeper')
      .replace('{style}', this.getShotStyleLabel(decision));
  }

  private buildShotLine(decision: RuleDecision, context: CommentaryContext) {
    const outcome = decision.shotOutcome;
    if (decision.setPieceType === 'penalty' && outcome === 'off_target') {
      return this.fill(pick(PENALTY_LINES.missed), decision, context);
    }

    if (outcome === 'on_target' && decision.keeperAction) {
      const pool = KEEPER_ACTION_LINES[decision.keeperAction];
      if (pool) {
        return this.fill(pick(pool), decision, context);
      }
    }

    const styleKey = decision.shotStyle ?? 'standard';
    const styleLines = SHOT_STYLE_LINES[styleKey] ?? SHOT_STYLE_LINES.standard;
    if (outcome === 'blocked') {
      return this.fill(pick(styleLines.blocked), decision, context);
    }
    if (outcome === 'off_target') {
      const pool = context.chanceQuality === 'big' ? SHOT_LINES.bigMiss : styleLines.off_target;
      return this.fill(pick(pool), decision, context);
    }
    if (outcome === 'on_target') {
      const pool = decision.restartType === 'corner' ? SHOT_LINES.parried : styleLines.on_target;
      return this.fill(pick(pool), decision, context);
    }
    return this.fill(pick(styleLines.off_target), decision, context);
  }

  private buildPassLine(decision: RuleDecision, context: CommentaryContext) {
    if (decision.setPieceType && decision.setPieceType !== 'penalty') {
      const pool = SET_PIECE_PASS_LINES[decision.setPieceType];
      if (pool) {
        return this.fill(pick(pool), decision, context);
      }
    }

    if (decision.turnoverReason === 'interception') {
      if (
        (decision.passStyle === 'cross' || decision.passStyle === 'whipped_cross') &&
        decision.turnoverPlayerName
      ) {
        return this.fill('{turnover} gets up to head clear.', decision, context);
      }
      if (decision.turnoverPlayerName) {
        return this.fill('{turnover} steps in to intercept.', decision, context);
      }
      return this.fill(pick(PASS_LINES.intercepted), decision, context);
    }
    if (decision.turnoverReason === 'miscontrol') {
      return this.fill(pick(PASS_LINES.miscontrol), decision, context);
    }
    if (decision.stats.pass) {
      const styleKey = decision.passStyle ?? 'ground';
      const pool = PASS_STYLE_LINES[styleKey] ?? PASS_STYLE_LINES.ground;
      return this.fill(pick(pool), decision, context);
    }
    return this.fill(pick(PASS_LINES.out), decision, context);
  }

  private getShotStyleLabel(decision: RuleDecision) {
    const style = decision.shotStyle ?? 'standard';
    if (decision.setPieceType === 'free_kick') {
      if (style === 'finesse') return 'bending free kick';
      if (style === 'power') return 'driven free kick';
      return 'free kick';
    }
    if (decision.setPieceType === 'penalty') return 'penalty';
    switch (style) {
      case 'finesse':
        return 'finesse shot';
      case 'power':
        return 'power drive';
      case 'chip':
        return 'chip';
      case 'header':
        return 'header';
      case 'overhead':
        return 'overhead kick';
      case 'trivela':
        return 'trivela effort';
      case 'volley':
        return 'volley';
      case 'placed':
        return 'placed finish';
      case 'long_range':
        return 'long-range strike';
      default:
        return 'shot';
    }
  }

  private buildMinuteLine(context: MinuteSummaryContext) {
    const minute = Math.max(1, context.minute);
    const prefix = `${minute}' `;
    const scoreLine = this.buildMinuteScoreLine(context);
    const details = this.buildMinuteDetails(context);
    const detailLine = details.length > 1 ? `${details[0]} ${details[1]}` : details[0];
    return `${prefix}${scoreLine} ${detailLine}`.trim();
  }

  private buildMinuteScoreLine(context: MinuteSummaryContext) {
    const homeScore = context.home.score;
    const awayScore = context.away.score;
    const score = `${homeScore}-${awayScore}`;
    if (context.minute <= 1) {
      return pick(MINUTE_SCORE_LINES.kickoff)
        .replace('{score}', score)
        .replace('{home}', context.home.name)
        .replace('{away}', context.away.name);
    }
    if (homeScore === awayScore) {
      return pick(MINUTE_SCORE_LINES.level)
        .replace('{score}', score)
        .replace('{home}', context.home.name)
        .replace('{away}', context.away.name);
    }
    const leader = homeScore > awayScore ? context.home.name : context.away.name;
    return pick(MINUTE_SCORE_LINES.lead)
      .replace('{score}', score)
      .replace('{leader}', leader);
  }

  private buildMinuteDetails(context: MinuteSummaryContext) {
    const details: string[] = [];
    const home = context.home;
    const away = context.away;
    const homeDelta = home.delta;
    const awayDelta = away.delta;

    const redTeam = homeDelta.redCards > 0 ? home : awayDelta.redCards > 0 ? away : null;
    if (redTeam) {
      details.push(pick(MINUTE_DISCIPLINE_LINES.red).replace('{team}', redTeam.name));
    }

    const yellowTeam = homeDelta.yellowCards > 0 ? home : awayDelta.yellowCards > 0 ? away : null;
    if (!redTeam && yellowTeam) {
      details.push(pick(MINUTE_DISCIPLINE_LINES.yellow).replace('{team}', yellowTeam.name));
    }

    const foulCount = homeDelta.fouls + awayDelta.fouls;
    if (details.length === 0 && foulCount >= 3) {
      details.push(pick(MINUTE_DISCIPLINE_LINES.fouls));
    }

    const chanceLeader = this.pickMinuteChanceLeader(home, away);
    if (chanceLeader) {
      const isBig = chanceLeader.severity === 'big';
      const line = pick(isBig ? MINUTE_CHANCE_LINES.big : MINUTE_CHANCE_LINES.small);
      details.push(line.replace('{team}', chanceLeader.team.name));
    }

    const setPieceTeam = homeDelta.corners > 0 ? home : awayDelta.corners > 0 ? away : null;
    if (setPieceTeam) {
      details.push(pick(MINUTE_SET_PIECE_LINES).replace('{team}', setPieceTeam.name));
    }

    if (homeDelta.offsides + awayDelta.offsides >= 2) {
      details.push(pick(MINUTE_OFFSIDE_LINES));
    }

    const possessionLeader = this.pickPossessionLeader(home, away);
    if (possessionLeader) {
      details.push(
        pick(MINUTE_POSSESSION_LINES)
          .replace('{team}', possessionLeader.name)
          .replace('{possession}', `${Math.round(possessionLeader.possessionPct)}`)
      );
    }

    const tempo = this.pickTempo(home, away);
    details.push(pick(MINUTE_TEMPO_LINES[tempo]));

    const fatigueTeam = this.pickFatigueTeam(home, away, context.minute);
    if (fatigueTeam) {
      details.push(pick(MINUTE_FATIGUE_LINES).replace('{team}', fatigueTeam.name));
    }

    if (details.length === 0) {
      details.push(pick(MINUTE_NEUTRAL_LINES));
    }

    if (details.length > 2) {
      return [details[0], details[1]];
    }
    if (details.length === 1) {
      details.push(pick(MINUTE_NEUTRAL_LINES));
    }
    return details;
  }

  private pickMinuteChanceLeader(home: MinuteTeamSnapshot, away: MinuteTeamSnapshot) {
    const homeThreat = home.delta.xg + home.delta.shotsOnTarget * 0.12 + home.delta.shots * 0.04;
    const awayThreat = away.delta.xg + away.delta.shotsOnTarget * 0.12 + away.delta.shots * 0.04;
    if (homeThreat <= 0 && awayThreat <= 0) return null;
    const diff = homeThreat - awayThreat;
    const winner = diff >= 0 ? home : away;
    const severity = Math.abs(diff) >= 0.2 || winner.delta.shotsOnTarget >= 1 ? 'big' : 'small';
    return { team: winner, severity };
  }

  private pickPossessionLeader(home: MinuteTeamSnapshot, away: MinuteTeamSnapshot) {
    const diff = home.possessionPct - away.possessionPct;
    if (Math.abs(diff) < 8) return null;
    return diff >= 0 ? home : away;
  }

  private pickTempo(home: MinuteTeamSnapshot, away: MinuteTeamSnapshot) {
    const totalPasses = home.delta.passes + away.delta.passes;
    const totalShots = home.delta.shots + away.delta.shots;
    if (totalShots >= 2 || totalPasses >= 18) return 'fast';
    if (totalShots === 0 && totalPasses <= 6) return 'slow';
    return 'balanced';
  }

  private pickFatigueTeam(home: MinuteTeamSnapshot, away: MinuteTeamSnapshot, minute: number) {
    if (minute < 60) return null;
    const homeFatigue = home.avgFatigue;
    const awayFatigue = away.avgFatigue;
    if (homeFatigue < 0.7 && awayFatigue < 0.7) return null;
    return homeFatigue >= awayFatigue ? home : away;
  }
}
