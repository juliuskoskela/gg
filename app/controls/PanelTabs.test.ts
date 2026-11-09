import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { hiddenToolbars } from "./toolbars";
import ToolbarRegistryHarness from "./test/ToolbarRegistryHarness.svelte";
import ToolbarContribution from "./test/ToolbarContribution.svelte";
import PanelTabs from "./PanelTabs.svelte";
import PanelTabsHarness from "./test/PanelTabsHarness.svelte";

afterEach(() => { cleanup(); hiddenToolbars.set(new Set()); });

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
    it("selects once from either the tab label or its surrounding pill", async () => {
        let onSelect = vi.fn();
        let { getByRole } = render(PanelTabs, { items, active: "diff", onSelect });
        let tab = getByRole("tab", { name: "Edit" });
        await fireEvent.click(tab.parentElement!);
        expect(onSelect).toHaveBeenCalledExactlyOnceWith("edit");
        onSelect.mockClear();
        await fireEvent.click(tab);
        expect(onSelect).toHaveBeenCalledExactlyOnceWith("edit");
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
    it("uses a plain movable title when only one view is open", async () => {
        let onClose = vi.fn();
        let { getByRole, queryByRole } = render(PanelTabs, { items: items.slice(0, 1), active: "diff", draggable: true, onSelect: () => {}, onClose });
        expect(queryByRole("tablist")).toBeNull();
        expect(queryByRole("tab")).toBeNull();
        let title = getByRole("button", { name: "Diff" });
        expect(title.querySelector(".panel-grip")).toBeNull();
        expect(title.parentElement?.classList.contains("panel-title-item")).toBe(true);
        expect(title.contains(getByRole("button", { name: "Close Diff" }))).toBe(false);
        await fireEvent.keyDown(title, { key: "Delete" });
        expect(onClose).toHaveBeenCalledWith("diff");
    });
    it("places active view tools below the title, outside tab semantics", () => {
        let { getByRole } = render(PanelTabsHarness);
        let tabs = getByRole("tablist");
        let tools = getByRole("button", { name: "Wrap lines" });
        expect(tabs.closest("[data-panel-bar]")?.contains(tools)).toBe(false);
        expect(tabs.closest(".panel-view-top")?.contains(tools)).toBe(true);
        expect(tools.closest("[data-panel-toolbar]")).not.toBeNull();
        expect(tabs.contains(tools)).toBe(false);
    });
    it("keeps a single title and its tools outside tab semantics", () => {
        let { getByRole, queryByRole } = render(PanelTabsHarness, { items: items.slice(0, 1) });
        expect(queryByRole("tablist")).toBeNull();
        expect(getByRole("heading", { name: "Diff" }).closest("[data-panel-bar]")?.contains(getByRole("button", { name: "Wrap lines" }))).toBe(false);
    });

    it("hides controls from keyboard navigation and restores the same toolbar", async () => {
        let { getByRole, queryByRole } = render(PanelTabsHarness);
        let toggle = getByRole("button", { name: "Hide Diff toolbar" });
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        let control = getByRole("button", { name: "Wrap lines" });
        expect(control.closest("[data-panel-toolbar]")?.id).toBe(toggle.getAttribute("aria-controls"));
        await fireEvent.click(toggle);
        expect(queryByRole("button", { name: "Wrap lines" })).toBeNull();
        await fireEvent.click(getByRole("button", { name: "Show Diff toolbar" }));
        expect(getByRole("button", { name: "Wrap lines" })).toBe(control);
    });
    it("hosts reactive extension controls, isolates view visibility and removes stale contributions", async () => {
        let { getByRole, queryByRole } = render(ToolbarRegistryHarness);
        let action = getByRole("button", { name: "Count 0" });
        expect(action.closest("[data-panel-toolbar]")).not.toBeNull();
        await fireEvent.click(action);
        expect(getByRole("button", { name: "Count 1" })).toBe(action);
        await fireEvent.click(getByRole("button", { name: "Hide Plugin toolbar" }));
        await fireEvent.click(getByRole("tab", { name: "Other" }));
        expect(getByRole("button", { name: "Other action" })).toBeTruthy();
        await fireEvent.click(getByRole("tab", { name: "Plugin" }));
        expect(queryByRole("button", { name: "Count 1" })).toBeNull();
        await fireEvent.click(getByRole("button", { name: "Show Plugin toolbar" }));
        expect(getByRole("button", { name: "Count 1" })).toBeTruthy();
        await fireEvent.click(getByRole("button", { name: "Disable extension" }));
        expect(queryByRole("button", { name: "Hide Plugin toolbar" })).toBeNull();
        expect(queryByRole("button", { name: "Count 1" })).toBeNull();
    });
    it("renders sibling contributions without replacing controls or removing them during cleanup", async () => {
        let { getByRole, queryByRole } = render(ToolbarRegistryHarness);
        let first = getByRole("button", { name: "Count 0" });
        await fireEvent.click(getByRole("button", { name: "Toggle contribution" }));
        let extra = getByRole("button", { name: "Extra action" });
        expect(getByRole("button", { name: "Count 0" })).toBe(first);
        expect(first.closest("[data-panel-toolbar]")).toBe(extra.closest("[data-panel-toolbar]"));
        await fireEvent.click(getByRole("button", { name: "Toggle contribution" }));
        expect(queryByRole("button", { name: "Extra action" })).toBeNull();
        expect(getByRole("button", { name: "Count 0" })).toBe(first);
        await fireEvent.click(getByRole("button", { name: "Toggle local" }));
        expect(queryByRole("button", { name: "Hide Plugin toolbar" })).toBeNull();
        expect(getByRole("button", { name: "Count 0" }).closest('[role="group"]')?.getAttribute("aria-label")).toBe("View tools");
        await fireEvent.click(getByRole("button", { name: "Toggle local" }));
        expect(getByRole("button", { name: "Hide Plugin toolbar" })).toBeTruthy();
    });

    it("renders a view's controls locally when there is no panel registry", () => {
        let { getByRole } = render(ToolbarContribution, { id: "plugin" });
        expect(getByRole("group", { name: "View tools" }).contains(getByRole("button", { name: "Count 0" }))).toBe(true);
    });

});
