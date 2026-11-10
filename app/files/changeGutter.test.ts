import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { RevChange } from "../messages/RevChange";
import { changeGutter, gutterMarks, markedLines, markerField, setMarks } from "./changeGutter";

function change(kind: RevChange["kind"], hunks: { from: [number, number]; to: [number, number]; lines: string[] }[]): RevChange {
    return {
        kind, has_conflict: false, path: { repo_path: "a.txt", relative_path: "a.txt" },
        hunks: hunks.map(hunk => ({ location: { from_file: { start: hunk.from[0], len: hunk.from[1] }, to_file: { start: hunk.to[0], len: hunk.to[1] } }, lines: { lines: hunk.lines } })),
    };
}

describe("change gutter marks", () => {
    it("marks added lines of a hunk with an empty from side, skipping context", () => {
        let marks = gutterMarks(change("Modified", [{ from: [3, 0], to: [4, 2], lines: ["+x\n", "+y\n"] }]));
        expect(marks).toEqual([{ line: 4, kind: "added" }, { line: 5, kind: "added" }]);
        marks = gutterMarks(change("Modified", [{ from: [1, 4], to: [1, 5], lines: [" a\n", " b\n", "+new\n", " c\n", " d\n"] }]));
        expect(marks).toEqual([{ line: 3, kind: "added" }]);
    });

    it("marks replaced lines as modified", () => {
        let marks = gutterMarks(change("Modified", [{ from: [1, 3], to: [1, 3], lines: [" a\n", "-b\n", "+B\n", " c\n"] }]));
        expect(marks).toEqual([{ line: 2, kind: "modified" }]);
        marks = gutterMarks(change("Modified", [{ from: [1, 2], to: [1, 3], lines: ["-a\n", "+A1\n", "+A2\n", " b\n"] }]));
        expect(marks).toEqual([{ line: 1, kind: "modified" }, { line: 2, kind: "modified" }]);
    });

    it("puts a deleted marker on the line after the gap", () => {
        let marks = gutterMarks(change("Modified", [{ from: [1, 4], to: [1, 3], lines: [" a\n", "-b\n", " c\n", " d\n"] }]));
        expect(marks).toEqual([{ line: 2, kind: "deleted" }]);
        marks = gutterMarks(change("Modified", [{ from: [11, 1], to: [11, 0], lines: ["-gone\n"] }]));
        expect(marks).toEqual([{ line: 11, kind: "deleted" }]);
    });

    it("handles several hunks, no-newline markers and unchanged or deleted files", () => {
        let marks = gutterMarks(change("Modified", [
            { from: [1, 1], to: [1, 2], lines: [" a\n", "+b\n"] },
            { from: [9, 2], to: [10, 2], lines: ["-x\n", "+y\n", "\\ No newline at end of file\n", " z"] },
        ]));
        expect(marks).toEqual([{ line: 2, kind: "added" }, { line: 10, kind: "modified" }]);
        expect(gutterMarks(undefined)).toEqual([]);
        expect(gutterMarks(change("Deleted", [{ from: [1, 1], to: [1, 0], lines: ["-a\n"] }]))).toEqual([]);
        expect(gutterMarks(change("Added", [{ from: [0, 0], to: [1, 2], lines: ["+a\n", "+b\n"] }]))).toEqual([{ line: 1, kind: "added" }, { line: 2, kind: "added" }]);
    });
});

describe("change gutter state", () => {
    let doc = "a\nb\nc\nd\n";
    let marks = [{ line: 2, kind: "added" as const }, { line: 4, kind: "deleted" as const }];

    it("builds markers from the initial marks, clamping past the end", () => {
        let state = EditorState.create({ doc, extensions: changeGutter([...marks, { line: 99, kind: "modified" }]) });
        expect(markedLines(state.field(markerField), state.doc)).toEqual([{ line: 2, kind: "added" }, { line: 4, kind: "deleted" }, { line: 5, kind: "modified" }]);
    });

    it("moves markers with the text while typing", () => {
        let state = EditorState.create({ doc, extensions: changeGutter(marks) });
        state = state.update({ changes: { from: 0, insert: "new\nmore\n" } }).state;
        expect(markedLines(state.field(markerField), state.doc)).toEqual([{ line: 4, kind: "added" }, { line: 6, kind: "deleted" }]);
    });

    it("replaces every marker on setMarks", () => {
        let state = EditorState.create({ doc, extensions: changeGutter(marks) });
        state = state.update({ effects: setMarks.of([{ line: 1, kind: "modified" }]) }).state;
        expect(markedLines(state.field(markerField), state.doc)).toEqual([{ line: 1, kind: "modified" }]);
    });
});
