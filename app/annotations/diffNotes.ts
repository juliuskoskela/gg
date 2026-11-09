import type { AnnotationThread } from "../messages/AnnotationThread";
import type { AnnotationTarget } from "../messages/AnnotationTarget";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import { effectiveAnchor } from "./anchors";

export interface DiffNote { side: "additions" | "deletions"; line: number; contextLine?: number; notes: AnnotationThread[]; }
function matches(target: AnnotationTarget, commit: string) {
    if (target.state.type === "missing" || target.state.type === "unknown") return false;
    if (target.relocation?.reason && !target.relocation.owner) return false;
    if (target.anchor.commit_id === commit && !target.relocation?.owner) return true;
    return target.anchor.kind === "lines" && target.anchor.side === "new" && target.state.type === "rewritten" && target.state.matches === true && target.state.commit_id === commit;
}
function newContextLine(change: RevChange, line: number) {
    let oldEnd = 1, newEnd = 1;
    for (let hunk of change.hunks) {
        if (line >= oldEnd && line < hunk.location.from_file.start) return newEnd + line - oldEnd;
        let old = hunk.location.from_file.start, current = hunk.location.to_file.start;
        for (let text of hunk.lines.lines) {
            if (old === line && text.startsWith("-")) return;
            if (old === line && text.startsWith(" ")) return current;
            if (text.startsWith(" ") || text.startsWith("-")) old++;
            if (text.startsWith(" ") || text.startsWith("+")) current++;
        }
        oldEnd = old; newEnd = current;
    }
    if (line >= oldEnd) return newEnd + line - oldEnd;
}
export function diffNotes(change: RevChange, headers: RevHeader[], threads: readonly AnnotationThread[]): DiffNote[] {
    if (change.has_conflict) return [];
    let found = new Map<string, DiffNote>();
    for (let note of threads) {
        if (note.status !== "open") continue;
        for (let target of note.targets) {
            let anchor = effectiveAnchor(target);
            if (anchor.kind !== "lines" || anchor.path !== change.path.repo_path) continue;
            let header = headers.find(header => header.id.change.hex === anchor.change_id);
            if (!header) continue;
            let side: DiffNote["side"] = anchor.side === "old" ? "deletions" : "additions";
            let line: number | undefined;
            if (headers.length === 1 && matches(target, header.id.commit.hex)) line = anchor.start;
            else if (headers.length > 1) {
                for (let hunk of change.hunks) {
                    let run = hunk.provenance?.lines.find(run => run.added === (side === "additions") && run.origin.change.hex === anchor.change_id && anchor.start >= run.origin_line && anchor.start < run.origin_line + run.len && matches(target, run.origin.commit.hex));
                    if (run) { line = run.line + anchor.start - run.origin_line; break; }
                }
            }
            if (line === undefined) continue;
            let key = `${side}:${line}`, group = found.get(key);
            if (!group) found.set(key, { side, line, contextLine: side === "deletions" ? newContextLine(change, line) : undefined, notes: [note] });
            else if (!group.notes.some(existing => existing.id === note.id)) group.notes.push(note);
        }
    }
    return [...found.values()].sort((a, b) => a.line - b.line || a.side.localeCompare(b.side));
}
