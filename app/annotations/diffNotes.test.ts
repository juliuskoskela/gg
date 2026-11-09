import { describe, expect, it } from "vitest";
import { diffNotes } from "./diffNotes";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { RevHeader } from "../messages/RevHeader";
import type { RevChange } from "../messages/RevChange";
let id = { change: { type: "ChangeId" as const, hex: "change", prefix: "change", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "commit", prefix: "commit", rest: "" } };
let header = { id } as RevHeader;
let file: RevChange = { kind: "Modified", path: { repo_path: "file", relative_path: "file" }, has_conflict: false, hunks: [] };
function note(side: "old" | "new" = "new"): AnnotationThread { return { id: "note", status: "open", workspace: "default", created_at: "now", updated_at: "now", posts: [], targets: [{ anchor: { kind: "lines", path: "file", side, start: 3, end: 5, quote: "source", change_id: "change", commit_id: "commit" }, subject: "", state: { type: "current" } }] }; }
describe("diff note coordinates", () => {
    it("keeps old and new sides separate and groups each open note once", () => {
        let old = note("old"), current = note(); current.targets.push(current.targets[0]);
        expect(diffNotes(file, [header], [old, current]).map(group => [group.side, group.line, group.notes.length])).toEqual([["additions", 3, 1], ["deletions", 3, 1]]);
        current.status = "resolved"; expect(diffNotes(file, [header], [current])).toEqual([]);
    });
    it("hides changed, missing, ambiguous and wrong-file anchors without guessing", () => {
        let stale = note(); stale.targets[0].anchor.commit_id = "old"; stale.targets[0].state = { type: "rewritten", commit_id: "commit", matches: false };
        expect(diffNotes(file, [header], [stale])).toEqual([]);
        stale.targets[0].anchor.commit_id = "commit";
        stale.targets[0].state = { type: "missing" }; expect(diffNotes(file, [header], [stale])).toEqual([]);
        stale.targets[0].state = { type: "unknown" }; expect(diffNotes(file, [header], [stale])).toEqual([]);
        stale.targets[0].state = { type: "current" };
        stale.targets[0].relocation = { owner: null, receipts: ["split"], reason: "Choose an owner" }; stale.targets[0].anchor.commit_id = "commit";
        expect(diffNotes(file, [header], [stale])).toEqual([]);
        expect(diffNotes({ ...file, path: { repo_path: "other", relative_path: "other" } }, [header], [note()])).toEqual([]);
    });
    it("uses verified relocation for new-side quotes but never assumes old-side coordinates", () => {
        let relocated = note(); relocated.targets[0].anchor.change_id = "original"; relocated.targets[0].anchor.commit_id = "old";
        relocated.targets[0].relocation = { owner: id, receipts: ["split"], reason: null };
        relocated.targets[0].state = { type: "rewritten", commit_id: "commit", matches: true };
        expect(diffNotes(file, [header], [relocated])[0].line).toBe(3);
        if (relocated.targets[0].anchor.kind === "lines") relocated.targets[0].anchor.side = "old";
        expect(diffNotes(file, [header], [relocated])).toEqual([]);
    });
    it("maps old-side context to its exact new-side position for unified views", () => {
        let context = { ...file, hunks: [{ location: { from_file: { start: 3, len: 1 }, to_file: { start: 4, len: 1 } }, lines: { lines: [" source\n"] } }] };
        expect(diffNotes(context, [header], [note("old")])[0]).toMatchObject({ side: "deletions", line: 3, contextLine: 4 });
    });
    it("maps source coordinates into a combined range only through exact hunk provenance", () => {
        let combined = { ...file, hunks: [{ location: { from_file: { start: 10, len: 1 }, to_file: { start: 12, len: 1 } }, lines: { lines: ["-before\n", "+source\n"] }, provenance: { origin: id, lines: [{ added: true, line: 12, len: 1, origin: id, origin_line: 3 }] } }] };
        expect(diffNotes(combined, [header, { id: { ...id, change: { ...id.change, hex: "other" } } } as RevHeader], [note()])[0].line).toBe(12);
        expect(diffNotes({ ...combined, hunks: [{ ...combined.hunks[0], provenance: undefined }] }, [header, header], [note()])).toEqual([]);
    });
});
