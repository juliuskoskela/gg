import { describe, expect, it } from "vitest";
import { GraphPageBuilder } from "./graphRows";
import type { LogRow } from "./messages/LogRow";
import type { RevHeader } from "./messages/RevHeader";

function row(index: number, lines: LogRow["lines"] = []): LogRow {
    let id = String(index);
    let revision: RevHeader = {
        id: { change: { type: "ChangeId", hex: id, prefix: id, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: id, prefix: id, rest: "" } },
        description: { lines: [id] }, author: { name: "Test", email: "test@example.com", timestamp: "" },
        refs: [], parent_ids: [], is_immutable: false, is_working_copy: false, has_conflict: false, working_copy_of: null,
    };
    return { revision, location: [0, index], padding: 0, lines };
}

describe("paged graph snapshots", () => {
    it("resolves an edge on the next page without changing the published first page", () => {
        let builder = new GraphPageBuilder();
        let source = row(0, [{ type: "ToIntersection", source: [0, 0], target: [1, 1], indirect: false }]);
        let first = builder.append([source]);
        let edge = first[0].passingLines[0];
        expect(edge.parent).toBeUndefined();
        let next = row(1);
        let second = builder.append([next]);
        expect(second[0]).not.toBe(first[0]);
        expect(second[0].passingLines[0].parent).toBe(next.revision);
        expect(second[1].passingLines[0].parent).toBe(next.revision);
        expect(second[0].passingLines[0].key).toBe(edge.key);
        expect(edge.parent).toBeUndefined();
        expect(source.lines[0]).not.toHaveProperty("key");
    });

    it("updates every row crossed by a newly completed edge, retaining untouched rows", () => {
        let builder = new GraphPageBuilder();
        let first = builder.append([row(0), row(1), row(2)]);
        let parent = row(3, [{ type: "FromNode", source: [0, 1], target: [0, 3], indirect: false }]);
        let second = builder.append([parent]);
        expect(second[0]).toBe(first[0]);
        for (let index of [1, 2, 3]) {
            expect(second[index].passingLines).toHaveLength(1);
            expect(second[index].passingLines[0].child).toBe(first[1].revision);
            expect(second[index].passingLines[0].parent).toBe(parent.revision);
        }
        expect(first[1].passingLines).toHaveLength(0);
        expect(first[2].passingLines).toHaveLength(0);
    });

    it("starts a fresh graph without reusing an old edge identity", () => {
        let builder = new GraphPageBuilder();
        let first = builder.append([row(0, [{ type: "ToMissing", source: [0, 0], target: [0, 1], indirect: false }])]);
        builder.reset();
        let second = builder.append([row(0, [{ type: "ToMissing", source: [0, 0], target: [0, 1], indirect: false }])]);
        expect(second).toHaveLength(1);
        expect(second[0].passingLines[0].key).toBeGreaterThan(first[0].passingLines[0].key);
    });
});
