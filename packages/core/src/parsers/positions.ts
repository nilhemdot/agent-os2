import type { Range } from "../model/types.js";

export class LineIndex {
  private starts: number[] = [0];
  constructor(public text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  pos(offset: number): { line: number; col: number } {
    let lo = 0, hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo, col: offset - this.starts[lo]! };
  }
  range(start: number, end: number): Range {
    const a = this.pos(start), b = this.pos(end);
    return { startLine: a.line, startCol: a.col, endLine: b.line, endCol: b.col };
  }
  offsetOf(line: number, col: number): number { return (this.starts[line] ?? this.text.length) + col; }
}
