import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { EditorView } from "@codemirror/view";
import { cleanupMocks, setupMocks } from "../mocks";
import type { FileContent } from "../messages/FileContent";
import type { RevChange } from "../messages/RevChange";
import type { RevChangeSummary } from "../messages/RevChangeSummary";
import type { RevHeader } from "../messages/RevHeader";
import { fileBuffers } from "./buffers";
import { filesLayout } from "./layout";
import { mountShell } from "../controls/test/shell";
import { annotationList, draft, lineMenu, openAnnotation } from "../annotations/store";
import { UNSAVED } from "./editorMenu";
import "../global.css";

let run = 0;
function header(name: string, extra: Partial<RevHeader> = {}): RevHeader {
    let hex = `${name}${run}`;
    return { id: { change: { type: "ChangeId", hex: `c${hex}`, prefix: "c", rest: hex }, commit: { type: "CommitId", hex, prefix: "c", rest: hex } }, is_working_copy: true, is_immutable: false, description: { lines: ["Working copy subject"] }, ...extra } as any;
}
function summaryChange(path: string): RevChangeSummary {
    return { kind: "Modified", has_conflict: false, path: { repo_path: path, relative_path: path }, stat: { added: 1, removed: 0 } as any };
}
// what loadRevisionSummary turns a summary change into
function change(path: string): RevChange {
    let { stat, ...rest } = summaryChange(path);
    return { ...rest, hunks: [], ...(stat ? { stat } : {}) };
}
function text(path: string, body: string, extra: Partial<Extract<FileContent, { type: "Text" }>> = {}): FileContent {
    return { type: "Text", path, text: body, version: `v-${path}`, editable: true, has_conflict: false, ...extra };
}

let files = ["README.md", "LICENSE", "app/main.ts", "c.txt"];
let reads: Record<string, unknown>[] = [];
let writes: Record<string, any>[] = [];
let content: (path: string) => FileContent | Promise<FileContent>;
let written: () => unknown;
let working: { name: string; changed: string[] };
let summaries: Record<string, unknown>[] = [];
let trees: Record<string, unknown>[] = [];
let summaryGate: Promise<unknown> | null = null;

// the view asks for the working copy by its commit, and gets the real change id back
function workingCopyDetail(name: string) {
    let at = header(name);
    return { type: "Detail", set: { from: at.id, to: at.id }, headers: [at], parents: [], changes: working.changed.map(summaryChange), conflicts: [] };
}

function mockHandler(cmd: string, args: Record<string, any>): unknown {
    if (cmd === "query_revision_summary") {
        summaries.push(args);
        if (summaryGate) return summaryGate.then(value => { if (value instanceof Error) throw value; return value; });
        return workingCopyDetail(working.name);
    }
    if (cmd === "query_revision_diff") return { type: "NotFound" };
    if (cmd === "query_revision_tree") { trees.push(args); return { files, truncated: false }; }
    if (cmd === "query_file") { reads.push(args); return content(args.path as string); }
    if (cmd === "write_file") { writes.push((args as any).mutation); return written(); }
}

describe("files view", () => {
    beforeEach(() => {
        run++;
        reads = [];
        writes = [];
        summaries = [];
        trees = [];
        summaryGate = null;
        working = { name: "aaa", changed: ["c.txt"] };
        localStorage.clear();
        // both are module state that outlives a test
        fileBuffers.clear();
        filesLayout.setTreeOpen(true);
        filesLayout.setTreeSide("left");
        filesLayout.setTreeHeight(240);
        filesLayout.setTreeWidth(260);
        filesLayout.setWrap(false);
        content = path => text(path, `contents of ${path}\n`);
        written = () => ({ type: "Unchanged" });
        setupMocks(mockHandler);
        lineMenu.set(null);
        draft.set(null);
        openAnnotation.set(null);
        annotationList.set(null);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {}, readText: async () => "" } });
        vi.spyOn(navigator.permissions, "query").mockResolvedValue({ state: "granted" } as PermissionStatus);
    });
    afterEach(async () => { vi.restoreAllMocks(); await cleanupMocks(); });

    // the view loads the working copy itself, so it only needs the status that names its commit
    async function setWorkingCopy(name: string) {
        let { repoStatusEvent } = await import("../stores");
        working.name = name;
        repoStatusEvent.set({ operation_description: "", working_copy: header(name).id.commit, can_redo: false });
    }
    async function mount(props: Partial<{ onOpenDiff: (change: RevChange) => void }> = {}, size = "width: 900px; height: 500px", settle = true) {
        // the open file is remembered per repository in module state, so each test gets its own
        let { repoConfigEvent } = await import("../stores");
        repoConfigEvent.set({ type: "Workspace", absolute_path: `/repo-${run}` } as any);
        await setWorkingCopy(working.name);
        let { default: FilesView } = await import("./FilesView.svelte");
        // sized before rendering, because the layout depends on the measured width
        // inside #shell, where the theme's tokens are defined, so spacing and colours are real
        let target = mountShell(900).appendChild(document.createElement("div"));
        target.style.cssText = `${size}; display: flex`;
        let result = render(FilesView, { target, props: { onOpenDiff: () => {}, ...props } });
        // the layout needs the working copy first
        if (settle) await waitFor(() => expect(target.querySelector(".body")).not.toBeNull());
        return result;
    }
    let row = (container: HTMLElement, path: string) => container.querySelector<HTMLElement>(`[role="treeitem"][aria-label="${path}"]`)!;
    async function open(container: HTMLElement, path: string) {
        await waitFor(() => expect(row(container, path)).not.toBeNull());
        await fireEvent.click(row(container, path));
    }
    let view = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector<HTMLElement>(".cm-editor")!)!;
    async function editor(container: HTMLElement) {
        await waitFor(() => expect(container.querySelector(".cm-editor")).not.toBeNull());
        return view(container);
    }
    function type(v: EditorView, insert: string) { v.dispatch({ changes: { from: 0, insert } }); }

    it("asks for a file, then opens an unchanged file from the tree", async () => {
        let { container } = await mount();
        expect(container.textContent).toContain("Select a file to open it.");
        await open(container, "README.md");
        let v = await editor(container);
        expect(v.state.doc.toString()).toBe("contents of README.md\n");
        expect(reads).toEqual([{ id: header("aaa").id, path: "README.md" }]);
        expect(container.querySelector(".crumbs")?.textContent).toBe("README.md");
    });

    it("loads the working copy itself and hands a changed file to the host with Open diff", async () => {
        let onOpenDiff = vi.fn();
        let { container, getByRole, queryByRole } = await mount({ onOpenDiff });
        await open(container, "c.txt");
        await editor(container);
        // a tree click only opens the file
        expect(onOpenDiff).not.toHaveBeenCalled();
        expect(summaries).toHaveLength(1);
        expect((summaries[0] as any).set.to.commit).toEqual(header("aaa").id.commit);
        await fireEvent.click(getByRole("button", { name: "Open diff" }));
        expect(onOpenDiff).toHaveBeenCalledTimes(1);
        expect(onOpenDiff).toHaveBeenCalledWith(change("c.txt"));
        await open(container, "README.md");
        await waitFor(() => expect(view(container).state.doc.toString()).toBe("contents of README.md\n"));
        expect(queryByRole("button", { name: "Open diff" })).toBeNull();
    });

    it("shows a loading note until the working copy arrives, then a retry when it fails", async () => {
        let release!: () => void;
        let gate = new Promise<void>(resolve => { release = resolve; });
        summaryGate = gate.then(() => new Error("offline"));
        let { container, getByRole } = await mount({}, undefined, false);
        expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading…");
        expect(container.querySelector('[role="treeitem"]')).toBeNull();
        release();
        await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn’t load the working copy"));
        summaryGate = null;
        await fireEvent.click(getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(row(container, "README.md")).not.toBeNull());
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it("shows the working copy badge when editable, and read only with no way to save when the backend says so", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        await editor(container);
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Working copy");
        expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Read only");
        await cleanupMocks();

        content = path => text(path, "<<<<\n", { editable: false, has_conflict: true });
        setupMocks(mockHandler);
        let second = await mount();
        await open(second.container, "README.md");
        await editor(second.container);
        let bar = second.container.querySelector(".editor-bar")!;
        expect(bar.textContent).toContain("Read only");
        expect(bar.textContent).toContain("Conflicted");
        expect(bar.textContent).not.toContain("Working copy");
        expect(bar.textContent).not.toContain("Edit this revision");
        expect(second.queryByRole("button", { name: "Save" })).toBeNull();
        expect(second.container.querySelector(".cm-content")?.getAttribute("aria-readonly")).toBe("true");
    });

    it("flags conflicted files", async () => {
        content = path => text(path, "x", { has_conflict: true, editable: false });
        let { container } = await mount();
        await open(container, "README.md");
        await editor(container);
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Conflicted");
    });

    it("marks typing as unsaved and puts a dot on the tree row", async () => {
        let { container, getByRole } = await mount();
        await open(container, "README.md");
        let v = await editor(container);
        expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Unsaved");
        type(v, "hi ");
        await waitFor(() => expect(container.querySelector(".editor-bar")?.textContent).toContain("Unsaved"));
        expect(row(container, "README.md").querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
        expect(getByRole("button", { name: "Save" })).not.toBeNull();
        await fireEvent.click(getByRole("button", { name: "Revert" }));
        await waitFor(() => expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Unsaved"));
        expect(v.state.doc.toString()).toBe("contents of README.md\n");
        expect(row(container, "README.md").querySelector('[aria-label="Unsaved changes"]')).toBeNull();
    });

    it("restores an unsaved edit when coming back to the file", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        type(await editor(container), "kept ");
        await open(container, "c.txt");
        await waitFor(() => expect(view(container).state.doc.toString()).toBe("contents of c.txt\n"));
        await open(container, "README.md");
        await waitFor(() => expect(view(container).state.doc.toString()).toBe("kept contents of README.md\n"));
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Unsaved");
    });

    it("saves with Mod-S using the loaded version, then clears the dirty state", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        let v = await editor(container);
        type(v, "hi ");
        await fireEvent.keyDown(v.contentDOM, { key: "s", ctrlKey: true });
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(writes[0]).toEqual({ id: header("aaa").id, path: "README.md", text: "hi contents of README.md\n", base_version: "v-README.md" });
        await waitFor(() => expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Unsaved"));
        expect(row(container, "README.md").querySelector('[aria-label="Unsaved changes"]')).toBeNull();
        await waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(2));
    });

    it("offers reload or overwrite when the file changed on disk", async () => {
        written = () => ({ type: "PreconditionError", message: "This file changed since it was opened." });
        let { container, getByRole } = await mount();
        await open(container, "README.md");
        let v = await editor(container);
        type(v, "mine ");
        await fireEvent.keyDown(v.contentDOM, { key: "s", ctrlKey: true });
        let alert = await waitFor(() => { let el = container.querySelector('.notice[role="alert"]'); expect(el?.textContent).toContain("This file changed on disk since you opened it."); return el!; });
        expect(alert).not.toBeNull();
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Unsaved");

        // overwrite re-reads the current version and writes the buffer with it
        content = path => text(path, "theirs\n", { version: "v2" });
        written = () => ({ type: "Unchanged" });
        await fireEvent.click(getByRole("button", { name: "Overwrite" }));
        await waitFor(() => expect(writes).toHaveLength(2));
        expect(writes[1].base_version).toBe("v2");
        expect(writes[1].text).toBe("mine contents of README.md\n");
        await waitFor(() => expect(container.querySelector('.notice[role="alert"]')).toBeNull());
    });

    it("reload discards the buffer and shows the file on disk", async () => {
        written = () => ({ type: "PreconditionError", message: "This file changed since it was opened." });
        let { container, getByRole } = await mount();
        await open(container, "README.md");
        let v = await editor(container);
        type(v, "mine ");
        await fireEvent.keyDown(v.contentDOM, { key: "s", ctrlKey: true });
        await waitFor(() => expect(container.querySelector('.notice[role="alert"]')).not.toBeNull());
        content = path => text(path, "theirs\n", { version: "v2" });
        await fireEvent.click(getByRole("button", { name: "Reload" }));
        await waitFor(() => expect(view(container).state.doc.toString()).toBe("theirs\n"));
        expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Unsaved");
        expect(container.querySelector('.notice[role="alert"]')).toBeNull();
    });

    it("shows other save errors and keeps the buffer", async () => {
        written = () => ({ type: "InternalError", message: { lines: ["disk full"] } });
        let { container } = await mount();
        await open(container, "README.md");
        let v = await editor(container);
        type(v, "x");
        await fireEvent.keyDown(v.contentDOM, { key: "s", ctrlKey: true });
        await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn’t save: disk full"));
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Unsaved");
    });

    it("explains binary, too large and missing files", async () => {
        let { container } = await mount();
        content = path => ({ type: "Binary", path, size: 12 * 1024 });
        await open(container, "README.md");
        await waitFor(() => expect(container.textContent).toContain("This is a binary file (12 KB)."));
        content = path => ({ type: "TooLarge", path, size: Math.round(14.2 * 1024 * 1024), limit: 5 * 1024 * 1024 });
        await open(container, "c.txt");
        await waitFor(() => expect(container.textContent).toContain("This file is too large to open here (14.2 MB; the limit is 5 MB)."));
        content = path => ({ type: "Missing", path });
        await open(container, "LICENSE");
        await waitFor(() => expect(container.textContent).toContain("This file isn’t in this revision."));
    });

    it("reports a failed read with a retry", async () => {
        content = () => { throw new Error("nope"); };
        let { container, getByRole } = await mount();
        await open(container, "README.md");
        await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn’t open the file"));
        content = path => text(path, "fine\n");
        await fireEvent.click(getByRole("button", { name: "Retry" }));
        expect((await editor(container)).state.doc.toString()).toBe("fine\n");
    });

    it("shows a loading note only after a delay", async () => {
        let release!: (value: FileContent) => void;
        content = () => new Promise<FileContent>(resolve => { release = resolve; });
        let { container } = await mount();
        await open(container, "README.md");
        expect(container.textContent).not.toContain("Loading…");
        await waitFor(() => expect(container.textContent).toContain("Loading…"));
        release(text("README.md", "late\n"));
        expect((await editor(container)).state.doc.toString()).toBe("late\n");
        expect(container.textContent).not.toContain("Loading…");
    });

    it("ignores a slow answer for a file that is no longer open", async () => {
        let slow!: (value: FileContent) => void;
        content = path => path === "README.md" ? new Promise<FileContent>(resolve => { slow = resolve; }) : text(path, "newer\n");
        let { container } = await mount();
        await open(container, "README.md");
        await waitFor(() => expect(reads).toHaveLength(1));
        await open(container, "c.txt");
        expect((await editor(container)).state.doc.toString()).toBe("newer\n");
        slow(text("README.md", "stale\n"));
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(view(container).state.doc.toString()).toBe("newer\n");
        expect(container.querySelector(".crumbs")?.textContent).toBe("c.txt");
    });

    it("follows the working copy when its commit changes, keeping a clean open file open", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        await editor(container);
        expect(trees).toEqual([{ id: header("aaa").id }]);
        content = path => text(path, "after an external edit\n", { version: "v2" });
        files = [...files, "new.txt"];
        working.changed = ["new.txt"];
        await setWorkingCopy("bbb");
        await waitFor(() => expect(view(container).state.doc.toString()).toBe("after an external edit\n"));
        await waitFor(() => expect(trees.at(-1)).toEqual({ id: header("bbb").id }));
        expect(trees.at(-1)).toEqual({ id: header("bbb").id });
        await waitFor(() => expect(row(container, "new.txt")).not.toBeNull());
        expect(container.querySelector(".crumbs")?.textContent).toBe("README.md");
        expect(container.querySelector(".editor-bar")?.textContent).not.toContain("Unsaved");
        expect(summaries).toHaveLength(2);
    });

    it("ignores a stale working copy answer", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        await editor(container);
        let slow!: () => void;
        summaryGate = new Promise(resolve => { slow = () => resolve(workingCopyDetail("old")); });
        await setWorkingCopy("old");
        await waitFor(() => expect(summaries).toHaveLength(2));
        // a newer status answers at once while the earlier request is still pending
        summaryGate = null;
        await setWorkingCopy("new");
        await waitFor(() => expect(trees.at(-1)).toEqual({ id: header("new").id }));
        slow();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(trees.at(-1)).toEqual({ id: header("new").id });
        expect(reads.at(-1)).toEqual({ id: header("new").id, path: "README.md" });
    });

    it("does not follow the revision selected in the timeline", async () => {
        let { container } = await mount();
        await open(container, "README.md");
        await editor(container);
        let { revisionSelectEvent, selectionHeaders } = await import("../stores");
        let older = header("old", { is_working_copy: false });
        selectionHeaders.set([older]);
        revisionSelectEvent.set({ from: older.id, to: older.id });
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(summaries).toHaveLength(1);
        expect(trees).toEqual([{ id: header("aaa").id }]);
        expect(reads).toHaveLength(1);
        expect(container.querySelector(".editor-bar")?.textContent).toContain("Working copy");
    });

    // the layout menu holds the tree's visibility, then the exclusive choice of side
    async function layoutOption(getByRole: (role: string, options: { name: string }) => HTMLElement, name: string) {
        // the menu stays open after a choice, so only open it when it is closed
        let trigger = getByRole("button", { name: "Editor layout" });
        if (trigger.getAttribute("aria-expanded") !== "true") await fireEvent.click(trigger);
        return await waitFor(() => getByRole(name === "File tree" ? "menuitemcheckbox" : "menuitemradio", { name }));
    }

    it("toggles the tree and resizes it from the keyboard", async () => {
        let { container, getByRole } = await mount();
        expect((await layoutOption(getByRole, "File tree")).getAttribute("aria-checked")).toBe("true");
        let splitter = getByRole("separator", { name: "Resize file tree" });
        let pane = () => container.querySelector<HTMLElement>(".browser > .pane")!;
        expect(splitter.getAttribute("aria-valuenow")).toBe("260");
        expect(pane().style.inlineSize).toBe("260px");
        await fireEvent.keyDown(splitter, { key: "ArrowRight" });
        await waitFor(() => expect(splitter.getAttribute("aria-valuenow")).toBe("284"));
        await fireEvent.keyDown(splitter, { key: "ArrowLeft" });
        await fireEvent.keyDown(splitter, { key: "ArrowLeft" });
        await waitFor(() => expect(splitter.getAttribute("aria-valuenow")).toBe("236"));
        await fireEvent.keyDown(splitter, { key: "Home" });
        await waitFor(() => expect(splitter.getAttribute("aria-valuenow")).toBe("180"));
        await fireEvent.keyDown(splitter, { key: "End" });
        await waitFor(() => expect(splitter.getAttribute("aria-valuenow")).toBe("450"));
        expect(JSON.parse(localStorage.getItem("gg.files.layout")!).treeWidth).toBe(450);

        await fireEvent.click(await layoutOption(getByRole, "File tree"));
        await waitFor(() => expect(pane().classList.contains("closed")).toBe(true));
        expect(container.querySelector('[role="separator"]')).toBeNull();
        expect(JSON.parse(localStorage.getItem("gg.files.layout")!).treeOpen).toBe(false);
        await fireEvent.click(await layoutOption(getByRole, "File tree"));
        await waitFor(() => expect(pane().classList.contains("closed")).toBe(false));
        expect(pane().style.inlineSize).toBe("450px");
    });

    it("moves the tree to the right, where the splitter grows it leftwards", async () => {
        let { container, getByRole } = await mount();
        await fireEvent.click(await layoutOption(getByRole, "Right"));
        await waitFor(() => expect(container.querySelector(".browser.right")).not.toBeNull());
        let pane = container.querySelector<HTMLElement>(".tree-pane")!.getBoundingClientRect();
        let editor = container.querySelector<HTMLElement>(".editor-pane")!.getBoundingClientRect();
        expect(pane.left).toBeGreaterThan(editor.left);
        expect(JSON.parse(localStorage.getItem("gg.files.layout")!).treeSide).toBe("right");
        let splitter = getByRole("separator", { name: "Resize file tree" });
        await fireEvent.keyDown(splitter, { key: "ArrowLeft" });
        await waitFor(() => expect(splitter.getAttribute("aria-valuenow")).toBe("284"));
        expect((await layoutOption(getByRole, "Right")).getAttribute("aria-checked")).toBe("true");
        expect((await layoutOption(getByRole, "Left")).getAttribute("aria-checked")).toBe("false");
    });

    it("opens both panes on bars of one height, so they read as one band", async () => {
        let { container } = await mount();
        let bars = [...container.querySelectorAll<HTMLElement>(".pane-bar")].map(bar => bar.getBoundingClientRect());
        expect(bars).toHaveLength(2);
        expect(bars[0].top).toBe(bars[1].top);
        expect(bars[0].height).toBe(bars[1].height);
        let field = container.querySelector<HTMLElement>(".tree-pane input")!.getBoundingClientRect(), bar = container.querySelector<HTMLElement>(".tree-pane .pane-bar")!.getBoundingClientRect();
        expect(Math.round(field.top - bar.top)).toBe(Math.round(field.left - bar.left));
    });

    it("keeps wrapping and the changed-only filter as icon toggles beside each other, not in the layout menu", async () => {
        let { container, getByRole, queryByRole } = await mount();
        let wrap = getByRole("button", { name: "Wrap lines" });
        let changed = getByRole("button", { name: "Show changed files only" });
        // the diff view's own wording and icon for wrapping, and one group for independent toggles
        expect(wrap.title).toBe("Wrap lines");
        expect(changed.title).toBe("Show changed files only");
        expect(wrap.parentElement).toBe(changed.parentElement);
        expect(wrap.parentElement!.getAttribute("aria-label")).toBe("Editor options");
        expect(wrap.querySelector("use")?.getAttribute("href")).toContain("#corner-down-left");
        expect(changed.querySelector("use")?.getAttribute("href")).toContain("#filter");
        expect(wrap.getAttribute("aria-pressed")).toBe("false");
        await fireEvent.click(wrap);
        await waitFor(() => expect(wrap.getAttribute("aria-pressed")).toBe("true"));
        expect(JSON.parse(localStorage.getItem("gg.files.layout")!).wrap).toBe(true);
        await fireEvent.click(await layoutOption(getByRole, "File tree"));
        expect(queryByRole("menuitemcheckbox", { name: "Wrap lines" })).toBeNull();
        // the summary stays ahead of the toggles
        let summary = await waitFor(() => { let found = container.querySelector<HTMLElement>(".tree-summary"); expect(found).not.toBeNull(); return found!; });
        expect(summary.textContent).toContain("5 files");
        expect(summary.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("filters the tree with the changed-only toggle", async () => {
        let { container, getByRole } = await mount();
        await waitFor(() => expect(row(container, "README.md")).not.toBeNull());
        let changed = getByRole("button", { name: "Show changed files only" });
        expect(changed.getAttribute("aria-pressed")).toBe("false");
        await fireEvent.click(changed);
        await waitFor(() => expect(changed.getAttribute("aria-pressed")).toBe("true"));
        await waitFor(() => expect(row(container, "README.md")).toBeNull());
        expect(row(container, "c.txt")).not.toBeNull();
    });

    it("becomes two pages in a narrow view", async () => {
        let { container, getByRole, queryByRole } = await mount({}, "width: 420px; height: 500px");
        await waitFor(() => expect(container.querySelector(".files-view.narrow")).not.toBeNull());
        expect(queryByRole("button", { name: "Editor layout" })).toBeNull();
        expect(getByRole("button", { name: "Wrap lines" })).not.toBeNull();
        expect(container.querySelector(".editor-pane")).toBeNull();
        await open(container, "README.md");
        await editor(container);
        expect(container.querySelector<HTMLElement>(".page")!.hidden).toBe(true);
        await fireEvent.click(getByRole("button", { name: "Back to file tree" }));
        await waitFor(() => expect(container.querySelector<HTMLElement>(".page")!.hidden).toBe(false));
        expect(container.querySelector(".editor-pane")).toBeNull();
    });

    // what the app menu would list: hidden commands carry a reason
    let menuLabels = () => (get(lineMenu)?.commands ?? []).filter(command => !command.reason).map(command => command.label);
    async function rightClick(target: Element, at: { x: number; y: number }, init: MouseEventInit = {}) {
        await fireEvent.contextMenu(target, { button: 2, clientX: at.x, clientY: at.y, ...init });
    }
    function pointAt(v: EditorView, pos: number) {
        let coords = v.coordsAtPos(pos)!;
        return { x: Math.floor(coords.left + 1), y: Math.floor((coords.top + coords.bottom) / 2) };
    }
    async function openMultiline(container: HTMLElement, path = "c.txt") {
        content = file => text(file, "alpha\n😀 beta gamma\ndelta\n");
        await open(container, path);
        let v = await editor(container);
        await waitFor(() => expect(v.state.doc.toString()).toBe("alpha\n😀 beta gamma\ndelta\n"));
        return v;
    }
    let lineStart = (v: EditorView, line: number) => v.state.doc.line(line).from;

    it("right-click in the editor opens the app menu at the pointer and moves the cursor to the clicked line", async () => {
        let { container } = await mount();
        let v = await openMultiline(container);
        let at = pointAt(v, lineStart(v, 3) + 2);
        await rightClick(v.contentDOM, at);
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(get(lineMenu)).toMatchObject({ x: at.x, y: at.y });
        expect(v.state.selection.main.head).toBe(lineStart(v, 3) + 2);
        // the native menu is suppressed, and nothing selected means no Cut or Copy
        expect(menuLabels()).toEqual(["Annotate line…", "Paste", "Select all", "Open diff", "Copy path"]);
    });

    it("keeps the selection when the click lands inside it, and moves the cursor when it lands outside", async () => {
        let { container } = await mount();
        let v = await openMultiline(container);
        v.dispatch({ selection: { anchor: lineStart(v, 1) + 1, head: lineStart(v, 2) + 4 } });
        v.focus();
        await rightClick(v.contentDOM, pointAt(v, lineStart(v, 2) + 1));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(v.state.selection.main).toMatchObject({ anchor: lineStart(v, 1) + 1, head: lineStart(v, 2) + 4 });
        expect(menuLabels()).toEqual(["Annotate lines…", "Annotate selection…", "Cut", "Copy", "Paste", "Select all", "Open diff", "Copy path"]);
        lineMenu.set(null);
        await rightClick(v.contentDOM, pointAt(v, lineStart(v, 3) + 1));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(v.state.selection.main.empty).toBe(true);
        expect(v.state.selection.main.head).toBe(lineStart(v, 3) + 1);
        expect(menuLabels()).toContain("Annotate line…");
    });

    it("annotates a selection with columns counted in scalar values after an emoji, and the lines without them", async () => {
        let { container } = await mount();
        let v = await openMultiline(container);
        // "bet" in "😀 beta gamma": UTF-16 offsets 3..6, scalar columns 2..5
        v.dispatch({ selection: { anchor: lineStart(v, 2) + 3, head: lineStart(v, 2) + 6 } });
        await rightClick(v.contentDOM, pointAt(v, lineStart(v, 2) + 4));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        let commands = get(lineMenu)!.commands;
        await commands.find(command => command.label === "Annotate selection…")!.execute();
        let id = header("aaa").id;
        expect(get(draft)?.targets).toEqual([{ subject: "Working copy subject", anchor: { kind: "lines", change_id: id.change.hex, commit_id: id.commit.hex, path: "c.txt", side: "new", start: 2, end: 2, quote: "😀 beta gamma", columns: { start: 2, end: 5 } } }]);
        draft.set(null);
        await commands.find(command => command.label === "Annotate line…")!.execute();
        let anchor = get(draft)!.targets[0].anchor;
        expect(anchor).toMatchObject({ kind: "lines", start: 2, end: 2, quote: "😀 beta gamma" });
        expect("columns" in anchor).toBe(false);
    });

    it("hides annotation while the buffer has unsaved edits, and keeps the commands for the palette with a reason", async () => {
        let { container } = await mount();
        let v = await openMultiline(container);
        type(v, "x");
        await waitFor(() => expect(container.querySelector(".editor-bar")?.textContent).toContain("Unsaved"));
        await rightClick(v.contentDOM, pointAt(v, lineStart(v, 2) + 1));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(menuLabels().some(label => label.startsWith("Annotate"))).toBe(false);
        let hidden = get(lineMenu)!.commands.filter(command => command.scope === "Annotation");
        expect(hidden.length).toBeGreaterThan(0);
        expect(hidden.every(command => command.reason === UNSAVED)).toBe(true);
    });

    it("opens the diff from the editor menu for a changed file, and has none for an unchanged one", async () => {
        let onOpenDiff = vi.fn();
        let { container } = await mount({ onOpenDiff });
        let v = await openMultiline(container);
        await rightClick(v.contentDOM, pointAt(v, 1));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        await get(lineMenu)!.commands.find(command => command.label === "Open diff")!.execute();
        expect(onOpenDiff).toHaveBeenCalledWith(change("c.txt"));
        lineMenu.set(null);
        await open(container, "README.md");
        await waitFor(() => expect(container.querySelector(".crumbs")?.textContent).toBe("README.md"));
        let other = await editor(container);
        await waitFor(() => expect(other.state.doc.toString()).toContain("alpha"));
        await rightClick(other.contentDOM, pointAt(other, 1));
        await waitFor(() => expect(get(lineMenu)).not.toBeNull());
        expect(menuLabels()).not.toContain("Open diff");
    });

    it("right-click on a file row offers annotate, open, diff and copy path", async () => {
        let { container } = await mount();
        await waitFor(() => expect(row(container, "c.txt")).not.toBeNull());
        await rightClick(row(container, "README.md"), { x: 30, y: 40 });
        expect(get(lineMenu)).toMatchObject({ x: 30, y: 40 });
        expect(menuLabels()).toEqual(["Annotate file…", "Open", "Copy path"]);
        await rightClick(row(container, "c.txt"), { x: 30, y: 60 });
        expect(menuLabels()).toEqual(["Annotate file…", "Open", "Open diff", "Copy path"]);
        await get(lineMenu)!.commands.find(command => command.label === "Annotate file…")!.execute();
        let id = header("aaa").id;
        expect(get(draft)?.targets).toEqual([{ subject: "Working copy subject", anchor: { kind: "file", change_id: id.change.hex, commit_id: id.commit.hex, path: "c.txt" } }]);
        await get(lineMenu)!.commands.find(command => command.label === "Open")!.execute();
        await waitFor(() => expect(container.querySelector(".crumbs")?.textContent).toBe("c.txt"));
    });

    it("right-click on a folder copies its path and expands or collapses it", async () => {
        let { container } = await mount();
        await waitFor(() => expect(row(container, "app")).not.toBeNull());
        await rightClick(row(container, "app"), { x: 5, y: 5 });
        expect(menuLabels()).toEqual(["Expand all", "Copy path"]);
        await get(lineMenu)!.commands.find(command => command.label === "Expand all")!.execute();
        await waitFor(() => expect(row(container, "app/main.ts")).not.toBeNull());
        await rightClick(row(container, "app"), { x: 5, y: 5 });
        expect(menuLabels()).toEqual(["Collapse", "Expand all", "Copy path"]);
        await get(lineMenu)!.commands.find(command => command.label === "Collapse")!.execute();
        await waitFor(() => expect(row(container, "app/main.ts")).toBeNull());
    });

    it("opens the row menu from the keyboard at the row, with the menu key and Shift+F10", async () => {
        let { container } = await mount();
        await waitFor(() => expect(row(container, "README.md")).not.toBeNull());
        let target = row(container, "README.md");
        let bounds = target.getBoundingClientRect();
        target.focus();
        await fireEvent.keyDown(target, { key: "ContextMenu" });
        expect(get(lineMenu)).toMatchObject({ x: bounds.left, y: bounds.bottom });
        expect(menuLabels()).toContain("Annotate file…");
        lineMenu.set(null);
        await fireEvent.keyDown(target, { key: "F10", shiftKey: true });
        expect(get(lineMenu)).toMatchObject({ x: bounds.left, y: bounds.bottom });
        // a contextmenu event without a pointer opens at the row too
        lineMenu.set(null);
        await fireEvent.contextMenu(target, { button: 0, clientX: 1, clientY: 1 });
        expect(get(lineMenu)).toMatchObject({ x: bounds.left, y: bounds.bottom });
    });

    it("marks lines of open notes on the working copy's change in a gutter beside the change gutter", async () => {
        let id = header("aaa").id;
        let anchor = (extra: object) => ({ kind: "lines" as const, change_id: id.change.hex, commit_id: "older-snapshot", path: "c.txt", side: "new" as const, start: 2, end: 2, quote: "q", ...extra });
        let thread = (name: string, targetAnchor: any, status: "open" | "resolved" = "open") => ({ id: name, status, workspace: "default", created_at: "t", updated_at: "t", posts: [{ id: "p", created_at: "t", author: { name: "A", kind: "human" }, body: `body ${name}` }], targets: [{ anchor: targetAnchor, subject: "", state: { type: "current" } }] });
        annotationList.set({ location: "", me: { name: "A", kind: "human" }, threads: [
            thread("mine", anchor({})),
            thread("other-file", anchor({ path: "README.md" })),
            thread("other-change", anchor({ change_id: "cother" })),
            thread("resolved", anchor({ start: 3, end: 3 }), "resolved"),
            thread("old-side", anchor({ side: "old" })),
        ] } as any);
        let { container, getByRole } = await mount();
        let v = await openMultiline(container);
        let marker = await waitFor(() => getByRole("button", { name: "Open 1 note on line 2" }));
        expect(container.querySelectorAll(".cm-note-gutter button")).toHaveLength(1);
        let gutters = [...v.dom.querySelectorAll(".cm-gutters .cm-gutter")].map(gutter => gutter.className);
        expect(gutters.findIndex(name => name.includes("cm-note-gutter"))).toBe(gutters.findIndex(name => name.includes("cm-change-gutter")) + 1);
        await fireEvent.click(marker);
        expect(get(openAnnotation)).toBe("mine");
    });
});
