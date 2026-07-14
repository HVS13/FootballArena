import { MatchEvent } from '../domain/matchContracts';

export type EventInput = Omit<MatchEvent, 'id' | 'sequence'>;
const MAX_MATCH_EVENTS = 50_000;

export class MatchEventRecorder {
  private sequence = 0;
  private events: MatchEvent[] = [];

  record(event: EventInput) {
    if (this.events.length >= MAX_MATCH_EVENTS) {
      throw new Error('Match event limit exceeded. The result cannot be recorded safely.');
    }
    this.sequence += 1;
    const recorded: MatchEvent = {
      ...event,
      id: `event-${this.sequence}`,
      sequence: this.sequence
    };
    this.events.push(recorded);
    return recorded;
  }

  getEvents() {
    return this.events.map((event) => ({
      ...event,
      position: event.position ? { ...event.position } : undefined,
      data: event.data ? { ...event.data } : undefined
    }));
  }
}
