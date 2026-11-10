import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRawSnippet } from "svelte";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import type { RevChange } from "../messages/RevChange";
import FileTreeView from "./FileTreeView.svelte";
import "../global.css";

function change(path: string, kind: RevChange["kind"] = "Modified", category?: RevChange["category"], stat = { added: 0, removed: 0 }): RevChange {
    return { kind, category, has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [], stat: stat as any };
}
// folder state outlives a test in module memory, so each test gets its own place
let run = 0;
let place = () => `place-${run}`;

function mount(props: Record<string, unknown>, size = "height: 300px; width: 400px; display: flex") {
    let shell = mountShell(400);
    shell.style.cssText += `; ${size}`;
    let changes = (props.changes ?? []) as RevChange[];
    let view = render(FileTreeView, { target: shell, props: { label: "Files", memoryKey: place(), seedKey: place(), changes, ...props } });
    return { ...view, shell };
}
let items = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')];
let names = (root: HTMLElement) => items(root).map(item => item.getAttribute("aria-label"));

describe("file tree view", () => {
    beforeEach(() => { run++; setupMocks(); });
    afterEach(async () => {
        document.documentElement.style.removeProperty("font-size");
        document.documentElement.style.removeProperty("--type-ui");
        await cleanupMocks();
    });

    it("lists the paths of its changes as a tree with levels, expanded by default", () => {
        let { shell } = mount({ changes: [change("src/lib/a.ts"), change("src/b.ts"), change("top.md")] });
        expect(shell.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe("Files");
        expect(names(shell)).toEqual(["src", "src/lib", "src/lib/a.ts", "src/b.ts", "top.md"]);
        expect(items(shell).map(item => item.getAttribute("aria-level"))).toEqual(["1", "2", "3", "2", "1"]);
        expect(items(shell)[0].getAttribute("aria-expanded")).toBe("true");
        expect(items(shell)[2].getAttribute("aria-selected")).toBe("false");
    });

    it("renders only a window of a long list and reaches the last file with End", async () => {
        let changes = Array.from({ length: 400 }, (_, i) => change(`folder/file-${String(i).padStart(3, "0")}.txt`));
        let { shell } = mount({ changes });
        await waitFor(() => expect(items(shell).length).toBeGreaterThan(1));
        expect(items(shell).length).toBeLessThan(40);
        let first = items(shell)[0];
        first.focus();
        await fireEvent.keyDown(first, { key: "End" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("folder/file-399.txt"));
        expect(names(shell).length).toBeLessThan(40);
        let list = shell.querySelector<HTMLElement>('[role="tree"]')!.getBoundingClientRect();
        let last = document.activeElement!.getBoundingClientRect();
        expect(last.top).toBeGreaterThanOrEqual(list.top);
        expect(last.bottom).toBeLessThanOrEqual(list.bottom + 1);
    });

    it("keeps enlarged rows apart", async () => {
        let changes = Array.from({ length: 240 }, (_, i) => change(`file-${String(i).padStart(3, "0")}.txt`));
        document.documentElement.style.fontSize = "16px";
        document.documentElement.style.setProperty("--type-ui", ".8125rem");
        let { shell } = mount({ changes }, "height: 300px; width: 390px; display: flex");
        let minimum = matchMedia("(pointer: coarse), (max-width: 600px)").matches ? 44 : 24;
        await waitFor(() => expect(items(shell)[0].getBoundingClientRect().height).toBe(minimum));
        document.documentElement.style.fontSize = "32px";
        await waitFor(() => expect(items(shell)[0].getBoundingClientRect().height).toBeGreaterThan(minimum));
        expect(items(shell)[0].getBoundingClientRect().bottom).toBeLessThanOrEqual(items(shell)[1].getBoundingClientRect().top);
    });

    it("filters by path, and a filter opens the folders that hold matches", async () => {
        let { shell, rerender } = mount({ changes: [change("src/lib/a.ts"), change("src/b.ts"), change("docs/c.md")], filter: "" });
        await rerender({ filter: "LIB/A" });
        expect(names(shell)).toEqual(["src", "src/lib", "src/lib/a.ts"]);
        await rerender({ filter: "zzz" });
        expect(names(shell)).toEqual([]);
        expect(shell.textContent).toContain("No matching files");
    });

    it("lists unchanged paths beside the changed ones and narrows to changed files", async () => {
        let { shell, rerender } = mount({ paths: ["a.txt", "b.txt", "dir/c.txt"], changes: [change("b.txt", "Added")], changedOnly: false });
        expect(names(shell)).toEqual(["dir", "a.txt", "b.txt"]);
        await rerender({ changedOnly: true });
        expect(names(shell)).toEqual(["b.txt"]);
    });

    it("groups by type with collapsible groups that show a count", async () => {
        let changes = [change("src/main.rs"), change("spec/main.rs", "Added", "Test"), change("spec/more.rs", "Added", "Test")];
        let { shell } = mount({ changes, groupByType: true });
        expect(names(shell)).toEqual(["Implementation", "src", "src/main.rs", "Tests", "spec", "spec/main.rs", "spec/more.rs"]);
        let group = items(shell)[3];
        expect(group.getAttribute("aria-level")).toBe("1");
        expect(group.getAttribute("aria-expanded")).toBe("true");
        expect(group.textContent).toContain("2");
        await fireEvent.click(group);
        await waitFor(() => expect(names(shell)).toEqual(["Implementation", "src", "src/main.rs", "Tests"]));
        expect(items(shell)[3].getAttribute("aria-expanded")).toBe("false");
        // arrow keys work on a group like on a folder
        await fireEvent.keyDown(items(shell)[3], { key: "ArrowRight" });
        await waitFor(() => expect(names(shell)).toContain("spec/more.rs"));
    });

    it("selects a changed file on click and reports every file to onOpen", async () => {
        let onSelect = vi.fn(), onOpen = vi.fn();
        let changes = [change("a.txt")];
        let { shell } = mount({ paths: ["a.txt", "b.txt"], changes, onSelect, onOpen });
        await fireEvent.click(items(shell)[1]);
        expect(onSelect).not.toHaveBeenCalled();
        expect(onOpen).toHaveBeenCalledWith("b.txt", undefined);
        await fireEvent.click(items(shell)[0]);
        expect(onSelect).toHaveBeenCalledWith(changes[0]);
    });

    it("scrolls a selected file that starts outside the window into view", async () => {
        let changes = Array.from({ length: 300 }, (_, i) => change(`f/file-${String(i).padStart(3, "0")}.txt`));
        let { shell } = mount({ changes, selectedPath: "f/file-250.txt" });
        let list = shell.querySelector<HTMLElement>('[role="tree"]')!;
        let visible = () => {
            let selected = items(shell).find(item => item.getAttribute("aria-selected") === "true");
            expect(selected).toBeDefined();
            let box = selected!.getBoundingClientRect(), frame = list.getBoundingClientRect();
            expect(box.top).toBeGreaterThanOrEqual(frame.top);
            expect(box.bottom).toBeLessThanOrEqual(frame.bottom + 1);
        };
        await waitFor(visible);
    });

    it("draws file rows through a host's snippet while folders keep the tree's own", async () => {
        let fileRow = createRawSnippet<[{ row: { name: string }; selected: boolean; tabindex: number }]>(context => ({ render: () => `<button type="button" role="treeitem" data-host tabindex="${context().tabindex}">${context().row.name}</button>` }));
        let { shell } = mount({ changes: [change("src/a.ts")], fileRow });
        expect(shell.querySelectorAll("[data-host]")).toHaveLength(1);
        expect(shell.querySelector("[data-host]")?.textContent).toBe("a.ts");
        expect(shell.querySelector('[role="treeitem"][aria-label="src"]')).not.toBeNull();
    });

    it("remembers a collapsed folder for its place", async () => {
        let changes = [change("src/a.ts")];
        let first = mount({ changes });
        await fireEvent.click(items(first.shell)[0]);
        await waitFor(() => expect(names(first.shell)).toEqual(["src"]));
        first.unmount();
        let second = mount({ changes });
        expect(names(second.shell)).toEqual(["src"]);
    });
});
