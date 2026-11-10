import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import { filesDrawer } from "./filesDrawer";
import ChangedFilesDrawer from "./ChangedFilesDrawer.svelte";
import "../global.css";

let changes: RevChange[] = ["a.txt", "b.txt", "c.txt"].map(path => ({ kind: "Modified", has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [] }));
let bar = createRawSnippet(() => ({ render: () => `<span class="file-path">bar</span>` }));

function mount(props: Record<string, unknown> = {}) {
    let selected: string[] = [];
    let result = render(ChangedFilesDrawer, { props: { changes, headers: [], selectedPath: "b.txt", reviewKey: "k", viewHeight: 1000, index: 1, onSelect: (change: RevChange) => selected.push(change.path.repo_path), children: bar, ...props } });
    return { ...result, selected };
}

describe("changed files drawer", () => {
    beforeEach(() => { setupMocks(); localStorage.clear(); filesDrawer.set({ open: false, height: 240 }); });
    afterEach(async () => { await cleanupMocks(); localStorage.clear(); });

    it("toggles from the handle and lists the files", async () => {
        let { getByRole, queryByRole, getByText } = mount();
        expect(getByText("2 of 3")).toBeTruthy();
        let toggle = getByRole("button", { name: "Show changed files" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(queryByRole("listbox")).toBeNull();
        await fireEvent.click(toggle);
        toggle = getByRole("button", { name: "Hide changed files" });
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(getByRole("listbox")).toBeTruthy();
        expect(getByRole("searchbox", { name: "Filter changed files" })).toBeTruthy();
        await fireEvent.click(toggle);
        expect(queryByRole("listbox")).toBeNull();
    });

    it("resizes with the keyboard and keeps the height across remounts", async () => {
        let first = mount();
        let separator = first.getByRole("separator");
        expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
        await fireEvent.keyDown(separator, { key: "ArrowUp" });
        expect(separator.getAttribute("aria-valuenow")).toBe("240");
        await fireEvent.keyDown(separator, { key: "ArrowUp" });
        expect(separator.getAttribute("aria-valuenow")).toBe("264");
        await fireEvent.keyDown(separator, { key: "ArrowDown" });
        expect(separator.getAttribute("aria-valuenow")).toBe("240");
        await fireEvent.keyDown(separator, { key: "End" });
        expect(separator.getAttribute("aria-valuenow")).toBe("700");
        await fireEvent.keyDown(separator, { key: "ArrowDown" });
        await fireEvent.keyDown(separator, { key: "Home" });
        expect(separator.getAttribute("aria-valuenow")).toBe("0");
        first.unmount();
        let second = mount();
        expect(second.getByRole("separator").getAttribute("aria-valuenow")).toBe("0");
        await fireEvent.click(second.getByRole("button", { name: "Show changed files" }));
        expect(second.getByRole("separator").getAttribute("aria-valuenow")).toBe("676");
        expect(JSON.parse(localStorage.getItem("gg.diff.files")!)).toEqual({ open: true, height: 676 });
        second.unmount();
        let third = mount();
        expect(third.getByRole("button", { name: "Hide changed files" })).toBeTruthy();
    });

    it("selects a file and stays open", async () => {
        let { getByRole, selected } = mount();
        await fireEvent.click(getByRole("button", { name: "Show changed files" }));
        let option = getByRole("listbox").querySelector<HTMLElement>('button[title="c.txt"], [data-path="c.txt"], button')!;
        let target = [...getByRole("listbox").querySelectorAll<HTMLElement>("button")].find(button => button.textContent?.includes("c.txt")) ?? option;
        await fireEvent.click(target);
        expect(selected).toEqual(["c.txt"]);
        expect(getByRole("button", { name: "Hide changed files" })).toBeTruthy();
    });

    it("drops the drawer for compact panes", () => {
        let { queryByRole } = mount({ drawer: false });
        expect(queryByRole("separator")).toBeNull();
        expect(queryByRole("button", { name: "Show changed files" })).toBeNull();
    });
});
