import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import type { RevHeader } from "../messages/RevHeader";
import "../global.css";

function change(path: string, kind: RevChange["kind"] = "Modified", added = 0, removed = 0): RevChange {
    return { kind, has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [], stat: { added, removed } as any };
}
// module state outlives a test, so each test gets its own revisions
let run = 0;
function header(name: string): RevHeader {
    let hex = `${name}${run}`;
    return { id: { change: { hex: `c${hex}`, prefix: "c", rest: hex }, commit: { hex, prefix: "c", rest: hex } } } as any;
}

let files = ["README.md", "app/main.ts", "app/lib/util.ts", "src/a.rs", "src/b.rs"];
let calls: unknown[] = [];

describe("repository tree", () => {
    beforeEach(() => {
        run++;
        calls = [];
        setupMocks((cmd, args) => {
            if (cmd === "query_revision_tree") { calls.push(args); return { files, truncated: false }; }
        });
    });
    afterEach(async () => { await cleanupMocks(); });

    async function mount(props: Partial<{ headers: RevHeader[]; changes: RevChange[]; selectedPath: string; onSelect: (change: RevChange) => void }> = {}) {
        let { default: RepositoryTree } = await import("./RepositoryTree.svelte");
        let result = render(RepositoryTree, { props: { headers: [header("aaa")], changes: [change("app/lib/util.ts", "Modified", 3, 1), change("src/a.rs", "Added", 5, 0), change("gone.txt", "Deleted", 0, 2)], selectedPath: "", onSelect: () => {}, ...props } });
        result.container.style.cssText = "height: 400px; width: 400px; display: flex";
        return result;
    }
    let items = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    let names = (container: HTMLElement) => items(container).map(item => item.getAttribute("aria-label"));

    it("asks for a hint when nothing is selected", async () => {
        let { container } = await mount({ headers: [] });
        expect(container.textContent).toContain("Select a revision to browse its files.");
        expect(calls).toHaveLength(0);
    });

    it("lists unchanged files with depth, roles and changed markers", async () => {
        let { container } = await mount();
        await waitFor(() => expect(items(container).length).toBeGreaterThan(0));
        expect(container.querySelector('[role="tree"]')).not.toBeNull();
        expect(names(container)).toEqual(["app", "app/lib", "app/lib/util.ts", "app/main.ts", "src", "src/a.rs", "src/b.rs", "gone.txt", "README.md"]);
        let byName = (name: string) => items(container).find(item => item.getAttribute("aria-label") === name)!;
        expect(byName("app").getAttribute("aria-level")).toBe("1");
        expect(byName("app/lib/util.ts").getAttribute("aria-level")).toBe("3");
        expect(byName("app").getAttribute("aria-expanded")).toBe("true");
        expect(byName("app").textContent).toContain("1");
        expect(byName("app/main.ts").querySelector(".stat")).toBeNull();
        expect(byName("app/lib/util.ts").querySelector(".ins")?.textContent).toBe("+3");
        expect(byName("app/lib/util.ts").querySelector(".del")?.textContent).toBe("−1");
        expect(byName("src/a.rs").querySelector('[aria-label="Added"]')).not.toBeNull();
        expect(byName("gone.txt").classList.contains("deleted")).toBe(true);
        expect(container.textContent).toContain("6 files");
        expect(container.textContent).toContain("3 changed");
        expect(calls).toEqual([{ id: header("aaa").id }]);
    });

    it("filters and shows changed files only", async () => {
        let { container, getByLabelText, getByRole } = await mount();
        await waitFor(() => expect(items(container).length).toBeGreaterThan(0));
        await fireEvent.input(getByLabelText("Filter files"), { target: { value: "B.RS" } });
        await waitFor(() => expect(names(container)).toEqual(["src", "src/b.rs"]));
        await fireEvent.input(getByLabelText("Filter files"), { target: { value: "" } });
        await fireEvent.click(getByRole("button", { name: "Changed only" }));
        await waitFor(() => expect(names(container)).toEqual(["app", "app/lib", "app/lib/util.ts", "src", "src/a.rs", "gone.txt"]));
    });

    it("selects changed files, only marks unchanged ones, and toggles folders", async () => {
        let onSelect = vi.fn();
        let { container } = await mount({ onSelect });
        await waitFor(() => expect(items(container).length).toBeGreaterThan(0));
        let byName = (name: string) => items(container).find(item => item.getAttribute("aria-label") === name)!;
        await fireEvent.click(byName("app/main.ts"));
        expect(onSelect).not.toHaveBeenCalled();
        expect(byName("app/main.ts").getAttribute("aria-selected")).toBe("true");
        await fireEvent.click(byName("src/a.rs"));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: expect.objectContaining({ repo_path: "src/a.rs" }) }));
        await fireEvent.click(byName("app"));
        await waitFor(() => expect(names(container)).not.toContain("app/main.ts"));
    });

    it("moves with the arrow keys, expands, collapses and activates", async () => {
        let onSelect = vi.fn();
        let { container } = await mount({ onSelect });
        await waitFor(() => expect(items(container).length).toBeGreaterThan(0));
        let byName = (name: string) => items(container).find(item => item.getAttribute("aria-label") === name)!;
        byName("app").focus();
        await fireEvent.keyDown(byName("app"), { key: "ArrowDown" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("app/lib"));
        await fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
        await waitFor(() => expect(names(container)).not.toContain("app/lib/util.ts"));
        await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
        await waitFor(() => expect(names(container)).toContain("app/lib/util.ts"));
        await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("app/lib/util.ts"));
        await fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("app/lib"));
        await fireEvent.keyDown(document.activeElement!, { key: "End" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("README.md"));
        await fireEvent.keyDown(document.activeElement!, { key: "Home" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("app"));
        await fireEvent.keyDown(byName("app/lib"), { key: "Enter" });
        await fireEvent.keyDown(byName("src/a.rs"), { key: " " });
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("notes that a range shows its newest revision", async () => {
        let { container } = await mount({ headers: [header("new"), header("old")] });
        await waitFor(() => expect(items(container).length).toBeGreaterThan(0));
        expect(container.textContent).toContain("Showing the newest of 2 selected revisions.");
        expect(calls).toEqual([{ id: header("new").id }]);
    });
});
