import { expect, it } from "vitest";
import type { RevId } from "../messages/RevId";
import type { ChangeHunk } from "../messages/ChangeHunk";
import type { RevChange } from "../messages/RevChange";
import { rangeLineTargets, rangeHunkTargets } from "./origins";

function id(value: string): RevId { return { change: { type: "ChangeId", hex: value, prefix: value, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: value, prefix: value, rest: "" } }; }
let first = id("first"), last = id("last");
let hunk: ChangeHunk = {
    location: { from_file: { start: 5, len: 1 }, to_file: { start: 8, len: 3 } },
    lines: { lines: [" context\n", "+earlier\n", "+later\n"] },
    provenance: { origin: last, lines: [
        { added: true, line: 9, len: 1, origin: first, origin_line: 3 },
        { added: true, line: 10, len: 1, origin: last, origin_line: 10 },
    ] },
};
let file: RevChange = { path: { repo_path: "file", relative_path: "file" }, kind: "Modified", has_conflict: false, hunks: [hunk] };

it("maps a combined selection into separate original-revision anchors", () => {
    let targets = rangeLineTargets(file, [], { side: "additions", start: 9, end: 10 })!;
    expect(targets.map(target => target.anchor)).toEqual([
        { kind: "lines", change_id: "first", commit_id: "first", path: "file", side: "new", start: 3, end: 3, quote: "earlier" },
        { kind: "lines", change_id: "last", commit_id: "last", path: "file", side: "new", start: 10, end: 10, quote: "later" },
    ]);
});

it("does not guess an owner for untouched context or absent provenance", () => {
    expect(rangeLineTargets(file, [], { side: "additions", start: 8, end: 9 })).toBeNull();
    expect(rangeHunkTargets({ ...hunk, provenance: undefined }, "file", [])).toBeNull();
});

it("annotates every changed source in a mixed-origin hunk", () => {
    expect(rangeHunkTargets(hunk, "file", [])).toHaveLength(2);
});

it("uses original old-side coordinates for deletions", () => {
    let removed: ChangeHunk = {
        location: { from_file: { start: 20, len: 2 }, to_file: { start: 20, len: 0 } },
        lines: { lines: ["-gone one\n", "-gone two\n"] },
        provenance: { origin: first, lines: [{ added: false, line: 20, len: 2, origin: first, origin_line: 7 }] },
    };
    let targets = rangeHunkTargets(removed, "file", [])!;
    expect(targets).toHaveLength(1);
    expect(targets[0].anchor).toMatchObject({ side: "old", start: 7, end: 8, quote: "gone one\ngone two", commit_id: "first" });
});
