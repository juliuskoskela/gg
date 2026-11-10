import type { RevChange } from "../messages/RevChange";

// kept apart from the editor so the view can compute marks without loading the editor engine
export type MarkKind = "added" | "modified" | "deleted";
/** a line of the revision's new side, 1-based; deleted marks sit on the line after the gap */
export type GutterMark = { line: number; kind: MarkKind };

/** marks for the "to" side of a revision's change to one file; hunks include context lines, so walk them */
export function gutterMarks(change: RevChange | undefined): GutterMark[] {
    if (!change || change.kind === "Deleted") return [];
    let marks: GutterMark[] = [];
    for (let hunk of change.hunks) {
        let line = hunk.location.to_file.start;
        let added: number[] = [];
        let removed = false;
        let flush = () => {
            if (added.length) for (let at of added) marks.push({ line: at, kind: removed ? "modified" : "added" });
            else if (removed) marks.push({ line, kind: "deleted" });
            added = [];
            removed = false;
        };
        for (let text of hunk.lines.lines) {
            let sign = text[0];
            if (sign === "+") { added.push(line); line++; }
            else if (sign === "-") removed = true;
            else if (sign === "\\") continue;
            else { flush(); line++; }
        }
        flush();
    }
    return marks;
}
