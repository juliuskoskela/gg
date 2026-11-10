import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import type { RevSet } from "../messages/RevSet";
import "../global.css";

function header(name: string, is_working_copy: boolean): RevHeader {
    return { id: { change: { type: "ChangeId", hex: `c${name}`, prefix: "c", rest: name }, commit: { type: "CommitId", hex: `m${name}`, prefix: "m", rest: name } }, is_working_copy, is_immutable: false, description: { lines: [name] }, author: { name: "n", email: "e", timestamp: "2024-01-01T00:00:00Z" }, has_conflict: false, working_copy_of: null, refs: [], parent_ids: [] } as any;
}
function change(path: string): RevChange {
    return { kind: "Modified", has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [], stat: { added: 1, removed: 0 } as any };
}

let older = header("old", false);
let working = header("wc", true);
let files = ["a.txt", "b.txt"];

function detailFor(set: RevSet) {
    let head = set.to.commit.hex === working.id.commit.hex ? working : older;
    return { type: "Detail" as const, set, headers: [head], parents: [], changes: files.map(change), conflicts: [] };
}

describe("workspace surface", () => {
    beforeEach(() => {
        localStorage.clear();
        setupMocks((cmd, args) => {
            if (cmd === "query_revision_summary") { let detail = detailFor((args as any).set); return { ...detail, changes: detail.changes.map(({ hunks, ...rest }) => rest) }; }
            if (cmd === "query_revision_tree") return { files, truncated: false };
            if (cmd === "query_file") return { type: "Text", path: args.path, text: "x\n", version: "v", editable: true, has_conflict: false };
            if (cmd === "query_revision_diff") return { type: "NotFound" };
        });
    });
    afterEach(async () => { await cleanupMocks(); });

    it("Open diff selects the working copy, keeps the file and focuses the Diff view", async () => {
        let { repoStatusEvent, repoConfigEvent, revisionSelectEvent, revisionReviewState } = await import("../stores");
        let { dock } = await import("./dock");
        let { repositoryScope } = await import("./repository");
        let { revisionIdentity } = await import("../revision/data");
        let { default: WorkspaceSurface } = await import("./WorkspaceSurface.svelte");
        let workspace = { type: "Workspace", absolute_path: "/repo", default_query: "", latest_query: "", status: { operation_description: "", working_copy: working.id.commit, can_redo: false }, theme_override: null, query_choices: {} } as any;
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        let scope = repositoryScope(workspace);
        dock.set({ root: { type: "split", direction: "row", ratio: 0.5, first: { type: "tabs", active: "tree", panels: ["tree"] }, second: { type: "tabs", active: "operation", panels: ["operation", "diff"] } }, compactActive: "tree" });

        // the timeline shows an older revision; an earlier visit to the working copy remembered another file
        let older_set: RevSet = { from: older.id, to: older.id };
        let wc_set: RevSet = { from: working.id, to: working.id };
        revisionReviewState.set(revisionIdentity(detailFor(wc_set), scope), { path: "a.txt", scrollTop: 0 });
        let target = document.body.appendChild(document.createElement("div"));
        target.style.cssText = "width: 1000px; height: 600px; display: flex";
        let view = render(WorkspaceSurface, { target, props: { workspace, compact: false, selection: { type: "data", value: detailFor(older_set) } as any } });
        // stands in for the app, which turns a selection event into the query the surface shows
        revisionSelectEvent.subscribe(set => { if (set && set.to.commit.hex === working.id.commit.hex) void view.rerender({ selection: { type: "data", value: detailFor(set) } as any }); });

        let tree = await waitFor(() => { let el = target.querySelector('[role="tree"]'); expect(el?.querySelector('[role="treeitem"]')).toBeTruthy(); return el!; });
        await fireEvent.click(tree.querySelector('[role="treeitem"][aria-label="b.txt"]')!);
        await waitFor(() => expect(target.querySelector(".editor-bar")?.textContent).toContain("Working copy"));
        await fireEvent.click(view.getByRole("button", { name: "Open diff" }));

        // the working copy is selected, the file survived the switch, and the Diff view came to the front
        await waitFor(() => expect(get(revisionSelectEvent)?.to.commit.hex).toBe(working.id.commit.hex));
        await waitFor(() => expect(revisionReviewState.get(revisionIdentity(detailFor(wc_set), scope))?.path).toBe("b.txt"));
        expect(get(dock).root).toMatchObject({ second: { active: "diff" } });
    });

    async function mountEditor() {
        let { repoStatusEvent, repoConfigEvent } = await import("../stores");
        let { dock } = await import("./dock");
        let { default: WorkspaceSurface } = await import("./WorkspaceSurface.svelte");
        // the open file is remembered per repository, so this one starts on the tree
        let workspace = { type: "Workspace", absolute_path: "/repo-editor", default_query: "", latest_query: "", status: { operation_description: "", working_copy: working.id.commit, can_redo: false }, theme_override: null, query_choices: {} } as any;
        repoConfigEvent.set(workspace);
        repoStatusEvent.set(workspace.status);
        dock.set({ root: { type: "tabs", active: "tree", panels: ["tree"] }, compactActive: "tree" });
        let target = document.body.appendChild(document.createElement("div"));
        target.style.cssText = "width: 1000px; height: 600px; display: flex";
        let view = render(WorkspaceSurface, { target, props: { workspace, compact: false, selection: { type: "data", value: detailFor({ from: working.id, to: working.id }) } as any } });
        await waitFor(() => expect(target.querySelector('[role="treeitem"]')).toBeTruthy());
        return { view, target };
    }

    it("names the view Editor in the Views menu and its tab, keeping the id saved layouts use", async () => {
        let { viewChoices, panelLabelFor } = await import("./panels");
        expect(viewChoices(false).find(choice => choice.id === "tree")?.label).toBe("Editor");
        expect(panelLabelFor("tree")).toBe("Editor");
        expect(viewChoices(false).some(choice => choice.label === "Files")).toBe(false);
    });

    it("shows the app's own edit menu on a text field in any view, instead of the native one", async () => {
        let { lineMenu } = await import("../annotations/store");
        lineMenu.set(null);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {}, readText: async () => "" } });
        let { view } = await mountEditor();
        let field = view.getByRole("searchbox", { name: "Filter files" }) as HTMLInputElement;
        field.value = "abc";
        field.setSelectionRange(0, 3);
        let event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 12, clientY: 14 });
        field.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(get(lineMenu)).toMatchObject({ x: 12, y: 14 });
        expect(get(lineMenu)!.commands.filter(command => !command.reason).map(command => command.label)).toEqual(["Cut", "Copy", "Paste", "Select all"]);
    });

    it("leaves an editable surface no component claimed to the native menu", async () => {
        let { lineMenu } = await import("../annotations/store");
        lineMenu.set(null);
        let { target } = await mountEditor();
        let editable = document.createElement("div");
        editable.contentEditable = "true";
        target.querySelector(".editor-pane, .tree-pane")!.append(editable);
        let event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
        editable.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(get(lineMenu)).toBeNull();
    });
});
