import { CommentaryLine } from '../domain/matchTypes';

const MAX_LINES = 50;

export class CommentaryAgent {
  private lines: CommentaryLine[] = [];

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
}
