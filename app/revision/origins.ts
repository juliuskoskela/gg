import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import type { ChangeHunk } from "../messages/ChangeHunk";
import type { TargetInput } from "../messages/TargetInput";
import { subjectOf } from "../annotations/anchors";

export function owningHeaders(change: RevChange, headers: RevHeader[]): RevHeader[] {
    return change.origin ? headers.filter(header => header.id.commit.hex === change.origin!.commit.hex) : headers.length === 1 ? headers : [];
}

function targets(hunks: ChangeHunk[], path: string, headers: RevHeader[], range?: { side: "additions" | "deletions"; start: number; end: number }): TargetInput[] | null {
    let lines: { added: boolean; line: number; origin: NonNullable<ChangeHunk["provenance"]>["lines"][number]["origin"]; source: number; text: string }[] = [];
    for (let hunk of hunks) {
        let old = hunk.location.from_file.start, next = hunk.location.to_file.start;
        for (let text of hunk.lines.lines) {
            let added = text.startsWith("+"), removed = text.startsWith("-");
            let line = added ? next : old;
            if ((added || removed) && (!range || (added === (range.side === "additions") && line >= range.start && line <= range.end))) {
                let origin = hunk.provenance?.lines.find(source => source.added === added && source.line <= line && line < source.line + source.len);
                if (!origin) return null;
                lines.push({ added, line, origin: origin.origin, source: origin.origin_line + line - origin.line, text: text.slice(1).replace(/\r?\n$/, "") });
            }
            if (added || text.startsWith(" ")) next++;
            if (removed || text.startsWith(" ")) old++;
        }
    }
    if (range && lines.length !== range.end - range.start + 1) return null;
    let result: TargetInput[] = [];
    for (let line of lines) {
        let previous = result.at(-1);
        let anchor = previous?.anchor;
        let side: "new" | "old" = line.added ? "new" : "old";
        if (anchor?.kind === "lines" && anchor.commit_id === line.origin.commit.hex && anchor.side === side && anchor.end + 1 === line.source) {
            anchor.end = line.source;
            anchor.quote += `\n${line.text}`;
        } else {
            let header = headers.find(header => header.id.commit.hex === line.origin.commit.hex);
            result.push({ anchor: { kind: "lines", change_id: line.origin.change.hex, commit_id: line.origin.commit.hex, path, side, start: line.source, end: line.source, quote: line.text }, subject: header ? subjectOf(header) : "" });
        }
    }
    return result;
}

export function rangeLineTargets(change: RevChange, headers: RevHeader[], range: { side: "additions" | "deletions"; start: number; end: number }) {
    return targets(change.hunks, change.path.repo_path, headers, range);
}

export function rangeHunkTargets(hunk: ChangeHunk, path: string, headers: RevHeader[]) {
    return targets([hunk], path, headers);
}
