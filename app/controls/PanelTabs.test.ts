import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import PanelTabs from "./PanelTabs.svelte";

afterEach(cleanup);

describe("panel header tabs", () => {
    let items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }];
    it("keeps one close action outside the tablist for the active panel", async () => {
        let onClose = vi.fn();
        let { getByRole, rerender } = render(PanelTabs, { items, active: "diff", onSelect: vi.fn(), onClose });
        let close = getByRole("button", { name: "Close Diff" });
        expect(getByRole("tablist").contains(close)).toBe(false);
        await fireEvent.click(close);
        expect(onClose).toHaveBeenCalledWith("diff");
        await rerender({ items, active: "edit", onSelect: vi.fn(), onClose });
        await fireEvent.click(getByRole("button", { name: "Close Edit" }));
        expect(onClose).toHaveBeenLastCalledWith("edit");
    });
    it("moves focus and selection with arrows and Home", async () => {
        let onSelect = vi.fn();
        let { getByRole } = render(PanelTabs, { items, active: "diff", onSelect });
        let diff = getByRole("tab", { name: "Diff" });
        let edit = getByRole("tab", { name: "Edit" });
        expect(diff.tabIndex).toBe(0);
        expect(edit.tabIndex).toBe(-1);
        diff.focus();
        await fireEvent.keyDown(diff, { key: "ArrowRight" });
        expect(onSelect).toHaveBeenLastCalledWith("edit");
        expect(document.activeElement).toBe(edit);
        await fireEvent.keyDown(edit, { key: "Home" });
        expect(onSelect).toHaveBeenLastCalledWith("diff");
        expect(document.activeElement).toBe(diff);
    });
});
