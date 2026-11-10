import { describe, expect, it } from "vitest";
import type { RevChange } from "../messages/RevChange";
import { defaultExpanded, treeSummary, visibleRows } from "./repositoryTree";

function change(path: string, kind: RevChange["kind"] = "Modified"): RevChange {
    return { kind, has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [] };
}

let files = ["README.md", "app/main.ts", "app/lib/util.ts", "app/lib/Zed.ts", "src/a.rs", "src/b.rs", "docs/guide.md"];
let paths = (rows: ReturnType<typeof visibleRows>) => rows.map(row => row.path);

describe("repository tree model", () => {
    it("sorts folders before files and shows only the top level when nothing is expanded", () => {
        let rows = visibleRows({ files, changes: [], expanded: new Set(), filter: "", changedOnly: false });
        expect(paths(rows)).toEqual(["app", "docs", "src", "README.md"]);
        expect(rows.every(row => row.depth === 0)).toBe(true);
        expect(rows[0]).toMatchObject({ kind: "folder", expanded: false, changed: 0 });
    });

    it("lists expanded folders with depth and case-insensitive names", () => {
        let rows = visibleRows({ files, changes: [], expanded: new Set(["app", "app/lib"]), filter: "", changedOnly: false });
        expect(paths(rows)).toEqual(["app", "app/lib", "app/lib/util.ts", "app/lib/Zed.ts", "app/main.ts", "docs", "src", "README.md"]);
        expect(rows.map(row => row.depth)).toEqual([0, 1, 2, 2, 1, 0, 0, 0]);
        expect(rows[2].name).toBe("util.ts");
    });

    it("counts changed files beneath folders and attaches changes", () => {
        let changes = [change("app/lib/util.ts"), change("src/a.rs", "Added")];
        let rows = visibleRows({ files, changes, expanded: defaultExpanded(changes), filter: "", changedOnly: false });
        expect(rows.find(row => row.path === "app")?.changed).toBe(1);
        expect(rows.find(row => row.path === "src")?.changed).toBe(1);
        expect(rows.find(row => row.path === "src/a.rs")?.change?.kind).toBe("Added");
        expect(rows.find(row => row.path === "src/b.rs")?.change).toBeUndefined();
        expect(rows.find(row => row.path === "docs")?.expanded).toBe(false);
    });

    it("expands every ancestor of a changed file by default", () => {
        expect([...defaultExpanded([change("a/b/c/d.txt"), change("top.txt")])].sort()).toEqual(["a", "a/b", "a/b/c"]);
    });

    it("merges deleted files that are no longer in the tree", () => {
        let changes = [change("old/gone.txt", "Deleted")];
        let rows = visibleRows({ files, changes, expanded: defaultExpanded(changes), filter: "", changedOnly: false });
        expect(paths(rows)).toContain("old");
        expect(paths(rows)).toContain("old/gone.txt");
        expect(treeSummary(files, changes)).toEqual({ files: files.length + 1, changed: 1 });
    });

    it("filters by path case-insensitively and opens the ancestors of matches", () => {
        let rows = visibleRows({ files, changes: [], expanded: new Set(), filter: "LIB/ut", changedOnly: false });
        expect(paths(rows)).toEqual(["app", "app/lib", "app/lib/util.ts"]);
        expect(rows.filter(row => row.kind === "folder").every(row => row.expanded)).toBe(true);
        expect(visibleRows({ files, changes: [], expanded: new Set(), filter: "nothing", changedOnly: false })).toEqual([]);
    });

    it("shows only changed files and their folders", () => {
        let changes = [change("src/b.rs"), change("README.md")];
        let rows = visibleRows({ files, changes, expanded: new Set(["src"]), filter: "", changedOnly: true });
        expect(paths(rows)).toEqual(["src", "src/b.rs", "README.md"]);
        let both = visibleRows({ files, changes, expanded: new Set(["src"]), filter: "readme", changedOnly: true });
        expect(paths(both)).toEqual(["README.md"]);
    });
});
