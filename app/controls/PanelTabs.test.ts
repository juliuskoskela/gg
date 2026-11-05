import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import PanelTabs from "./PanelTabs.svelte";

afterEach(cleanup);

describe("panel header tabs", () => {
    let items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }];
    it("closes each tab independently without selecting it", async () => {
        let onClose = vi.fn(), onSelect = vi.fn();
        let { getByRole } = render(PanelTabs, { items, active: "diff", onSelect, onClose });
        for (let item of items) {
            let tab = getByRole("tab", { name: item.label });
            let close = getByRole("button", { name: `Close ${item.label}` });
            expect(tab.contains(close)).toBe(false);
            expect(tab.parentElement).toBe(close.parentElement);
            await fireEvent.click(close);
            expect(onClose).toHaveBeenLastCalledWith(item.id);
        }
        expect(onSelect).not.toHaveBeenCalled();
        expect(getByRole("tab", { name: "Diff" }).getAttribute("aria-selected")).toBe("true");
    });
    it("supports deleting the focused tab", async () => {
        let onClose = vi.fn(), onSelect = vi.fn();
        let { getByRole } = render(PanelTabs, { items, active: "diff", onSelect, onClose });
        await fireEvent.keyDown(getByRole("tab", { name: "Diff" }), { key: "Delete" });
        expect(onClose).toHaveBeenCalledWith("diff");
        expect(onSelect).not.toHaveBeenCalled();
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
