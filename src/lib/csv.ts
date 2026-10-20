/**
 * Incremental RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, leading BOM.
 * Feed it chunks with push() so multi-hundred-MB files never sit in memory at once.
 */
export class CsvParser {
  private row: string[] = [];
  private field = "";
  private inQuotes = false;
  /** A quote seen at the end of a chunk: either a closing quote or the first half of "". */
  private pendingQuote = false;
  private pendingCR = false;
  private started = false;

  constructor(private readonly onRow: (row: string[]) => void) {}

  push(chunk: string): void {
    let i = 0;
    if (!this.started && chunk.length > 0) {
      this.started = true;
      if (chunk.charCodeAt(0) === 0xfeff) i = 1;
    }
    for (; i < chunk.length; i++) {
      const ch = chunk[i];
      if (this.pendingCR) {
        this.pendingCR = false;
        if (ch === "\n") continue;
      }
      if (this.pendingQuote) {
        this.pendingQuote = false;
        if (ch === '"') {
          this.field += '"';
          continue;
        }
        this.inQuotes = false;
      }
      if (this.inQuotes) {
        // Fast path: copy everything up to the next quote in one slice.
        const next = chunk.indexOf('"', i);
        if (next === -1) {
          this.field += chunk.slice(i);
          break;
        }
        this.field += chunk.slice(i, next);
        i = next;
        this.pendingQuote = true;
      } else if (ch === '"') {
        this.inQuotes = true;
      } else if (ch === ",") {
        this.row.push(this.field);
        this.field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r") this.pendingCR = true;
        this.endRow();
      } else {
        this.field += ch;
      }
    }
  }

  end(): void {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.inQuotes = false;
    }
    if (this.field !== "" || this.row.length > 0) this.endRow();
  }

  private endRow(): void {
    this.row.push(this.field);
    const row = this.row;
    this.row = [];
    this.field = "";
    if (row.some((f) => f.trim() !== "")) this.onRow(row);
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const parser = new CsvParser((row) => rows.push(row));
  parser.push(text);
  parser.end();
  return rows;
}
