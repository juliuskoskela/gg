import { describe, expect, it, vi } from "vitest";
import { Text } from "@codemirror/state";
import type { RevHeader } from "../messages/RevHeader";
import { MAX_LINES } from "../annotations/anchors";
import type { TextTarget } from "../commands/textCommands";
import { UNSAVED, editorAnchor, editorCommands, lineSpan, scalarOffset, selectionColumns } from "./editorMenu";

let header = { id: { change: { type: "ChangeId", hex: "cwc", prefix: "c", rest: "wc" }, commit: { type: "CommitId", hex: "mwc", prefix: "m", rest: "wc" } }, description: { lines: ["", "Subject line"] }, is_working_copy: true, is_immutable: false } as unknown as RevHeader;
let doc = Text.of(["alpha", "😀 beta gamma", "delta", ""]);
let target: TextTarget = { selected: () => "", editable: true, replaceSelection: () => {}, selectAll: () => {}, focus: () => {} };

function commands(from: number, to: number, extra: Partial<Parameters<typeof editorCommands>[0]> = {}) {
    return editorCommands({ doc, from, to, target, path: "src/a.txt", header, dirty: false, paste: null, ...extra });
}
let labels = (list: ReturnType<typeof commands>) => list.filter(command => !command.reason).map(command => command.label);
let at = (line: number, offset: number) => doc.line(line).from + offset;

describe("line spans", () => {
    it("takes the clicked line when nothing is selected", () => {
        expect(lineSpan(doc, at(2, 3), at(2, 3))).toMatchObject({ start: 2, end: 2, empty: true, whole: false });
    });
    it("spans every line a selection touches, and recognises whole lines", () => {
        expect(lineSpan(doc, at(1, 2), at(3, 1))).toMatchObject({ start: 1, end: 3, from: 2, to: 1, empty: false, whole: false });
        expect(lineSpan(doc, at(1, 0), at(2, doc.line(2).length))).toMatchObject({ start: 1, end: 2, whole: true });
    });
    it("leaves out a line the selection only reaches the start of, as native editors do", () => {
        expect(lineSpan(doc, at(1, 0), at(2, 0))).toMatchObject({ start: 1, end: 1, whole: true });
        expect(lineSpan(doc, at(1, 2), at(2, 0))).toMatchObject({ start: 1, end: 1, from: 2, to: 5, whole: false });
        // only the line break is selected: nothing of any line
        expect(lineSpan(doc, at(1, 5), at(2, 0))).toMatchObject({ empty: true });
    });
});

describe("selection columns", () => {
    it("counts Unicode scalar values, so a character outside the BMP counts once", () => {
        // "😀 beta gamma": the emoji is two UTF-16 units and one scalar value
        expect(scalarOffset("😀 beta gamma", 2)).toBe(1);
        expect(scalarOffset("😀 beta gamma", 8)).toBe(7);
        let from = at(2, 3), to = at(2, 6);
        expect(doc.sliceString(from, to)).toBe("bet");
        let span = lineSpan(doc, from, to);
        expect(selectionColumns(doc, span)).toEqual({ start: 2, end: 5 });
    });
    it("starts on the first line and ends, exclusive, on the last", () => {
        let span = lineSpan(doc, at(1, 3), at(3, 2));
        expect(selectionColumns(doc, span)).toEqual({ start: 3, end: 2 });
    });
});

describe("editor anchors", () => {
    it("quotes the whole lines of the working copy's new side", () => {
        let anchor = editorAnchor(header, "src/a.txt", doc, lineSpan(doc, at(1, 2), at(2, 4)), false);
        expect(anchor).toEqual({ kind: "lines", change_id: "cwc", commit_id: "mwc", path: "src/a.txt", side: "new", start: 1, end: 2, quote: "alpha\n😀 beta gamma" });
    });
    it("adds columns only for a selection", () => {
        let anchor = editorAnchor(header, "src/a.txt", doc, lineSpan(doc, at(2, 3), at(2, 6)), true);
        expect(anchor).toMatchObject({ start: 2, end: 2, quote: "😀 beta gamma", columns: { start: 2, end: 5 } });
    });
});

describe("editor menu commands", () => {
    it("annotates the clicked line when nothing is selected", () => {
        expect(labels(commands(at(2, 1), at(2, 1)))).toEqual(["Annotate line…", "Paste", "Select all", "Copy path"]);
    });
    it("annotates lines, and offers the selection only when it doesn't cover whole lines", () => {
        let partial = commands(at(1, 2), at(2, 4), { target: { ...target, selected: () => "x" } });
        expect(labels(partial)).toEqual(["Annotate lines…", "Annotate selection…", "Cut", "Copy", "Paste", "Select all", "Copy path"]);
        let whole = commands(at(1, 0), at(2, doc.line(2).length), { target: { ...target, selected: () => "x" } });
        expect(labels(whole)).toEqual(["Annotate lines…", "Cut", "Copy", "Paste", "Select all", "Copy path"]);
    });
    it("orders annotation, edit and file groups", () => {
        let groups = commands(at(1, 2), at(2, 4), { onOpenDiff: () => {}, target: { ...target, selected: () => "x" } }).map(command => command.group);
        expect(groups).toEqual([...groups].sort((a, b) => a! - b!));
        expect(new Set(groups).size).toBe(3);
    });
    it("shows Open diff only for a changed file", () => {
        expect(labels(commands(0, 0))).not.toContain("Open diff");
        let open = vi.fn();
        let found = commands(0, 0, { onOpenDiff: open }).find(command => command.label === "Open diff")!;
        void found.execute();
        expect(open).toHaveBeenCalled();
    });
    it("hides Cut and Paste when the buffer is read only", () => {
        let list = commands(at(1, 1), at(1, 3), { target: { ...target, editable: false, selected: () => "lp" } });
        expect(labels(list)).toEqual(["Annotate line…", "Annotate selection…", "Copy", "Select all", "Copy path"]);
    });
    it("keeps annotation commands, with a reason, while the buffer has unsaved edits", () => {
        let list = commands(at(1, 2), at(2, 4), { dirty: true });
        let annotating = list.filter(command => command.scope === "Annotation");
        expect(annotating.length).toBeGreaterThan(0);
        expect(annotating.every(command => command.reason === UNSAVED)).toBe(true);
        expect(labels(list)).not.toContain("Annotate lines…");
    });
    it("refuses ranges beyond the diff's limit", () => {
        let long = Text.of(Array.from({ length: MAX_LINES + 2 }, (_, i) => `line ${i}`));
        let list = editorCommands({ doc: long, from: 0, to: long.length, target, path: "x", header, dirty: false, paste: null });
        expect(list.find(command => command.scope === "Annotation")!.reason).toBe(`Annotate at most ${MAX_LINES} lines`);
    });
    it("offers no annotation without a working copy header, but still edits", () => {
        expect(labels(commands(0, 0, { header: undefined }))).toEqual(["Paste", "Select all", "Copy path"]);
    });
    it("builds the anchor when the menu opens", async () => {
        let { draft } = await import("../annotations/store");
        let { get } = await import("svelte/store");
        draft.set(null);
        let list = commands(at(2, 3), at(2, 6));
        await list.find(command => command.id === "annotate-selection")!.execute();
        expect(get(draft)?.targets).toEqual([{ subject: "Subject line", anchor: expect.objectContaining({ kind: "lines", start: 2, end: 2, columns: { start: 2, end: 5 } }) }]);
        draft.set(null);
    });
});
