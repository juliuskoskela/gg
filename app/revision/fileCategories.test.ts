import { describe, expect, it } from "vitest";
import type { RevChange } from "../messages/RevChange";
import { categoryOf, groupFiles, lineCounts } from "./fileCategories";

function file(path: string, category?: RevChange["category"]): RevChange {
    return { path: { repo_path: path, relative_path: path }, category, kind: "Modified", has_conflict: false, hunks: [], stat: { added: 3, removed: 1 } };
}

describe("review file categories", () => {
    it("keeps uncategorized files as implementation and retains every group", () => {
        let changes = [file("test.rs", "Test"), file("main.rs"), file("generated.rs", "Generated")];
        expect(categoryOf(changes[1])).toBe("Implementation");
        expect(groupFiles(changes).map(group => group.value)).toEqual(["Implementation", "Test", "Generated"]);
        expect(groupFiles(changes).flatMap(group => group.changes)).toHaveLength(3);
    });
    it("reports implementation lines while preserving full totals", () => {
        expect(lineCounts([file("a.rs"), file("test.rs", "Test")])).toEqual({ added: 3, removed: 1, totalAdded: 6, totalRemoved: 2 });
        expect(lineCounts([file("generated.rs", "Generated")])).toEqual({ added: 0, removed: 0, totalAdded: 3, totalRemoved: 1 });
    });
});
