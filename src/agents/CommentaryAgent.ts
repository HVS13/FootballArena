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
    '{player} miscontrols under pressure.',
    '{player} lets it run away.',
    'A heavy touch from {player}.'
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

export class CommentaryAgent {
  private lines: CommentaryLine[] = [];

  addDecision(decision: RuleDecision, context: CommentaryContext) {
    const text = this.buildDecisionLine(decision, context);
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
      if (decision.shotOutcome === 'blocked') {
        return this.fill(pick(SHOT_LINES.blocked), decision, context);
      }
      if (decision.shotOutcome === 'off_target') {
        const pool = context.chanceQuality === 'big' ? SHOT_LINES.bigMiss : SHOT_LINES.missed;
        return this.fill(pick(pool), decision, context);
      }
      if (decision.shotOutcome === 'on_target') {
        const pool = decision.restartType === 'corner' ? SHOT_LINES.parried : SHOT_LINES.saved;
        return this.fill(pick(pool), decision, context);
      }
      return this.fill(pick(SHOT_LINES.missed), decision, context);
    }

    if (decision.type === 'pass') {
      if (decision.turnoverReason === 'interception') {
        return this.fill(pick(PASS_LINES.intercepted), decision, context);
      }
      if (decision.turnoverReason === 'miscontrol') {
        return this.fill(pick(PASS_LINES.miscontrol), decision, context);
      }
      if (decision.stats.pass) {
        return this.fill(pick(PASS_LINES.success), decision, context);
      }
      return this.fill(pick(PASS_LINES.out), decision, context);
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
      .replace('{scoreAgainst}', String(context.scoreAgainst));
  }
}
