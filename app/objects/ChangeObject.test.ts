import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { get } from "svelte/store";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import { currentSource } from "../stores";
import ChangedFiles from "../revision/ChangedFiles.svelte";
import ChangeObject from "./ChangeObject.svelte";
import "../global.css";

let header = { id: { change: { hex: "c1", prefix: "c", rest: "1" }, commit: { hex: "a1", prefix: "a", rest: "1" } }, is_immutable: false, parent_ids: [] } as unknown as RevHeader;
let change: RevChange = { kind: "Modified", has_conflict: false, path: { repo_path: "src/a.ts", relative_path: "src/a.ts" }, hunks: [], stat: { added: 2, removed: 1 } as any };

describe("change object in a file tree", () => {
    beforeEach(() => { setupMocks(); currentSource.set(null); });
    afterEach(async () => { await cleanupMocks(); });

    it("is a tree item drawn by the shared row, still a drag source with the change as its operand", async () => {
        let { getByRole, container } = render(ChangeObject, { target: mountShell(400), props: { change, headers: [header], selected: false, tree: true } });
        let item = getByRole("treeitem", { name: "src/a.ts" });
        expect(item.getAttribute("draggable")).toBe("true");
        expect(item.querySelector(".file-row .name")?.textContent).toBe("a.ts");
        expect(item.querySelector(".ins")?.textContent).toBe("+2");
        expect(container.querySelector(".zone")).not.toBeNull();
        let transfer = new DataTransfer();
        await fireEvent.dragStart(item, { dataTransfer: transfer });
        expect(get(currentSource)).toEqual({ type: "Change", headers: [header], path: change.path, hunk: null });
    });

    it("stays a drag source when the changed files pane draws it", async () => {
        let view = render(ChangedFiles, { target: mountShell(400), props: { changes: [change], headers: [header], selectedPath: "", reviewKey: "drag-test", onSelect: () => {} } });
        let item = view.getByRole("treeitem", { name: "src/a.ts" });
        await fireEvent.dragStart(item, { dataTransfer: new DataTransfer() });
        expect(get(currentSource)).toEqual({ type: "Change", headers: [header], path: change.path, hunk: null });
        expect(item.getAttribute("aria-level")).toBe("2");
    });

    it("keeps the list option role outside a tree", () => {
        let { getByRole } = render(ChangeObject, { target: mountShell(400), props: { change, headers: [header], selected: false } });
        expect(getByRole("option", { name: "src/a.ts" })).toBeTruthy();
    });
});
