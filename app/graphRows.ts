import type { LogLine } from "./messages/LogLine";
import type { LogRow } from "./messages/LogRow";
import type { RevHeader } from "./messages/RevHeader";

export type EnhancedLine = LogLine & { key: number; parent?: RevHeader; child: RevHeader };
export interface EnhancedRow extends LogRow {
    passingLines: EnhancedLine[];
}

// backend edges can finish on a later page. publish snapshots without exposing those mutations.
export class GraphPageBuilder {
    private rows: EnhancedRow[] = [];
    private published: EnhancedRow[] = [];
    private pending: EnhancedLine[] = [];
    private nextKey = 0;

    reset(): void {
        this.rows = [];
        this.published = [];
        this.pending = [];
    }

    append(page: readonly LogRow[]): EnhancedRow[] {
        let changed = new Set<number>();
        for (let source of page) {
            if (this.pending.length) changed.add(this.rows.length - 1);
            for (let line of this.pending) line.parent = source.revision;
            let row: EnhancedRow = {
                ...source,
                lines: source.lines.map(line => ({ ...line })),
                passingLines: this.pending,
            };
            this.pending = [];
            for (let sourceLine of row.lines) {
                let line: EnhancedLine;
                if (sourceLine.type === "ToIntersection" || sourceLine.type === "ToMissing") {
                    line = { ...sourceLine, key: this.nextKey++, child: row.revision };
                    row.passingLines.push(line);
                    this.pending.push(line);
                } else {
                    let child = this.rows[sourceLine.source[1]]?.revision;
                    if (!child) throw new Error("Graph edge starts outside the loaded history");
                    line = { ...sourceLine, key: this.nextKey++, parent: row.revision, child };
                    for (let index = sourceLine.source[1]; index < sourceLine.target[1]; index++) {
                        this.rows[index].passingLines.push(line);
                        changed.add(index);
                    }
                    row.passingLines.push(line);
                }
            }
            changed.add(this.rows.length);
            this.rows.push(row);
        }
        let snapshot = this.published.slice();
        for (let index of changed) {
            let row = this.rows[index];
            snapshot[index] = { ...row, passingLines: row.passingLines.map(line => ({ ...line })) };
        }
        this.published = snapshot;
        return snapshot;
    }
}
