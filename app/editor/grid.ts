export type Cell = { text: string; hl: number };
export type Highlight = { foreground?: number; background?: number; special?: number; bold?: boolean; italic?: boolean; reverse?: boolean; underline?: boolean };
export type Redraw = [string, ...unknown[][]];

export class NeovimGrid {
    rows: Cell[][] = [];
    highlights = new Map<number, Highlight>();
    foreground = 0xc8ced8;
    background = 0x111318;
    cursor = { row: 0, col: 0 };
    mode = "normal";
    // ext_linegrid omits unchanged highlight IDs within each grid_line call.
    apply(events: Redraw[]): boolean {
        let flush = false;
        for (let [name, ...calls] of events) for (let call of calls) {
            if (name === "grid_resize") {
                let [, cols, rows] = call as number[];
                this.rows = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => this.rows[row]?.[col] ?? { text: " ", hl: 0 }));
            } else if (name === "grid_line") {
                let [, row, start, cells] = call as [number, number, number, [string, number?, number?][]];
                let col = start, hl = 0;
                for (let [text, nextHl, repeat = 1] of cells) {
                    hl = nextHl ?? hl;
                    for (let i = 0; i < repeat; i++) if (this.rows[row]?.[col]) this.rows[row][col++] = { text, hl };
                }
            } else if (name === "grid_clear") this.rows = this.rows.map(row => row.map(() => ({ text: " ", hl: 0 })));
            else if (name === "grid_scroll") {
                let [, top, bottom, left, right, rows, cols] = call as number[];
                let copy = this.rows.map(row => row.slice());
                for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
                    this.rows[y][x] = y + rows >= top && y + rows < bottom && x + cols >= left && x + cols < right ? copy[y + rows][x + cols] : { text: " ", hl: 0 };
                }
            } else if (name === "hl_attr_define") this.highlights.set(call[0] as number, call[1] as Highlight);
            else if (name === "default_colors_set") {
                if ((call[0] as number) >= 0) this.foreground = call[0] as number;
                if ((call[1] as number) >= 0) this.background = call[1] as number;
            } else if (name === "grid_cursor_goto") this.cursor = { row: call[1] as number, col: call[2] as number };
            else if (name === "mode_change") this.mode = call[0] as string;
            else if (name === "flush") flush = true;
        }
        return flush;
    }
}
