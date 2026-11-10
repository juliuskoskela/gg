import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import ChangedFiles from "../revision/ChangedFiles.svelte";
import FileTreeView from "./FileTreeView.svelte";
import "../global.css";

let header = { id: { change: { hex: "c1", prefix: "c", rest: "1" }, commit: { hex: "a1", prefix: "a", rest: "1" } }, is_immutable: false, parent_ids: [] } as unknown as RevHeader;
let changes: RevChange[] = [
    { kind: "Modified", has_conflict: false, path: { repo_path: "src/lib/util.ts", relative_path: "src/lib/util.ts" }, hunks: [], stat: { added: 3, removed: 1 } as any },
    { kind: "Deleted", has_conflict: false, path: { repo_path: "src/old.ts", relative_path: "src/old.ts" }, hunks: [], stat: { added: 0, removed: 4 } as any },
];

describe("file row parity", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => { await cleanupMocks(); });

    it("gives the editor's row and the diff's change object row the same box, indent, icon and name", async () => {
        let editor = mountShell(400);
        editor.style.cssText += "; height: 300px; display: flex";
        render(FileTreeView, { target: editor, props: { label: "Files", memoryKey: "parity-editor", seedKey: "parity-editor", changes } });
        // the diff's pane has its own bar, so rows are compared by their own position
        render(ChangedFiles, { target: editor, props: { changes, headers: [header], selectedPath: "", reviewKey: "parity-diff", onSelect: () => {} } });
        await waitFor(() => expect(editor.querySelectorAll('[role="treeitem"]').length).toBe(2 * 4));

        let trees = [...editor.querySelectorAll<HTMLElement>('[role="tree"]')];
        expect(trees).toHaveLength(2);
        function measure(tree: HTMLElement, path: string) {
            let item = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(row => row.getAttribute("aria-label") === path)!;
            let slot = item.closest<HTMLElement>("[data-index]")!;
            let box = slot.getBoundingClientRect();
            let icon = slot.querySelector("img")!.getBoundingClientRect();
            let name = slot.querySelector(".name")!.getBoundingClientRect();
            return { height: box.height, icon: icon.left - box.left, iconTop: icon.top - box.top, name: name.left - box.left, deleted: getComputedStyle(slot.querySelector(".name")!).textDecorationLine, stat: slot.querySelector(".stat")?.textContent };
        }
        for (let path of ["src/lib/util.ts", "src/old.ts"]) {
            let editorRow = measure(trees[0], path), diffRow = measure(trees[1], path);
            expect(diffRow).toEqual(editorRow);
            expect(editorRow.stat).not.toBeUndefined();
        }
        expect(measure(trees[0], "src/old.ts").deleted).toBe("line-through");
        expect(measure(trees[0], "src/lib/util.ts").icon).toBeGreaterThan(measure(trees[0], "src/old.ts").icon);
    });
});
