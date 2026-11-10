import { describe, expect, it } from "vitest";
import type { AnnotationThread } from "../messages/AnnotationThread";
import type { RevHeader } from "../messages/RevHeader";
import { lineNotes } from "./noteGutter";

let header = { id: { change: { type: "ChangeId", hex: "cwc", prefix: "c", rest: "wc" }, commit: { type: "CommitId", hex: "new", prefix: "n", rest: "ew" } } } as unknown as RevHeader;
function thread(id: string, anchor: object = {}, state: AnnotationThread["targets"][0]["state"] = { type: "current" }, status: "open" | "resolved" = "open"): AnnotationThread {
    return { id, status, workspace: "w", created_at: "t", updated_at: "t", posts: [], targets: [{ anchor: { kind: "lines", change_id: "cwc", commit_id: "old", path: "a.txt", side: "new", start: 4, end: 6, quote: "", ...anchor } as any, subject: "", state }] };
}

describe("editor note lines", () => {
    it("matches by change id and path, whatever commit the note was made on", () => {
        expect(lineNotes("a.txt", header, [thread("x")]).map(entry => [entry.line, entry.notes.map(note => note.id)])).toEqual([[4, ["x"]]]);
    });
    it("groups notes on one line and orders the lines", () => {
        let found = lineNotes("a.txt", header, [thread("late", { start: 9 }), thread("a", { start: 2 }), thread("b", { start: 2 })]);
        expect(found.map(entry => [entry.line, entry.notes.map(note => note.id)])).toEqual([[2, ["a", "b"]], [9, ["late"]]]);
    });
    it("leaves out resolved notes, other files and changes, old-side and non-line anchors, and unplaceable states", () => {
        let threads = [
            thread("resolved", {}, { type: "current" }, "resolved"),
            thread("file", { path: "b.txt" }),
            thread("change", { change_id: "other" }),
            thread("old", { side: "old" }),
            thread("kind", { kind: "file" }),
            thread("missing", {}, { type: "missing" }),
            thread("unknown", {}, { type: "unknown" }),
        ];
        expect(lineNotes("a.txt", header, threads)).toEqual([]);
    });
    it("shows nothing without a working copy", () => {
        expect(lineNotes("a.txt", undefined, [thread("x")])).toEqual([]);
    });
});
