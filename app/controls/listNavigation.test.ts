import { describe, expect, it } from "vitest";
import { navigationIndex, revealRow, selectionAction, virtualRange } from "./listNavigation";

let plain = { ctrlKey: false, metaKey: false, shiftKey: false };
let capabilities = { focus: true, toggle: true, clear: true };
function action(key: string, from: number, to = from, modifiers = {}) {
    return selectionAction({ key, ...plain, ...modifiers }, { from, to }, 20, 5, capabilities);
}

describe("shared list navigation", () => {
    it("clamps movement, ignores unknown keys and has no destination in an empty list", () => {
        expect(navigationIndex("ArrowUp", 0, 3)).toBe(0);
        expect(navigationIndex("ArrowDown", 2, 3)).toBe(2);
        expect(navigationIndex("Home", 2, 3)).toBe(0);
        expect(navigationIndex("End", 0, 3)).toBe(2);
        expect(navigationIndex("PageDown", 1, 20, 5)).toBe(6);
        expect(navigationIndex("PageUp", 3, 20, 5)).toBe(0);
        expect(navigationIndex("Tab", 0, 3)).toBeNull();
        expect(navigationIndex("Home", 0, 0)).toBeNull();
    });

    it("collapses a selected range in the direction of travel, including reversed ranges", () => {
        for (let [from, to] of [[3, 7], [7, 3]]) {
            expect(action("ArrowUp", from, to)).toEqual({ type: "select", index: 2 });
            expect(action("ArrowDown", from, to)).toEqual({ type: "select", index: 8 });
            expect(action("PageUp", from, to)).toEqual({ type: "select", index: 0 });
            expect(action("PageDown", from, to)).toEqual({ type: "select", index: 12 });
        }
    });

    it("extends from the active end and keeps scattered selection on modified movement", () => {
        expect(action("ArrowUp", 3, 7, { shiftKey: true })).toEqual({ type: "extend", index: 6 });
        expect(action("ArrowDown", 3, 7, { ctrlKey: true })).toEqual({ type: "focus", index: 8 });
        expect(action("ArrowDown", 3, 7, { metaKey: true })).toEqual({ type: "focus", index: 8 });
        expect(action("ArrowDown", 3, 7, { ctrlKey: true, shiftKey: true })).toEqual({ type: "extend", index: 8 });
        expect(action(" ", 3, 7, { ctrlKey: true })).toEqual({ type: "toggle", index: 7 });
        expect(action("Escape", 3)).toEqual({ type: "clear" });
    });

    it("preserves range activation and unavailable capability behavior", () => {
        expect(action("Enter", 3)).toEqual({ type: "edit", index: 3 });
        expect(action("Enter", 3, 7)).toBeNull();
        expect(action("ArrowUp", 0)).toBeNull();
        expect(action("ArrowDown", 19)).toBeNull();
        expect(selectionAction({ key: "ArrowDown", ...plain, ctrlKey: true }, { from: 3, to: 7 }, 20, 5, { focus: false, toggle: false, clear: false }))
            .toEqual({ type: "select", index: 8 });
        expect(selectionAction({ key: "Escape", ...plain }, { from: 3, to: 7 }, 20, 5, { focus: false, toggle: false, clear: false })).toBeNull();
    });

    it("keeps viewport pools stable while overscanning and filling the final screen", () => {
        expect(virtualRange(0, 100, 20)).toEqual({ start: 0, end: 6, count: 6 });
        expect(virtualRange(120, 100, 20)).toEqual({ start: 6, end: 12, count: 6 });
        expect(virtualRange(120, 100, 20, 4, 4)).toEqual({ start: 2, end: 15, count: 13 });
        expect(virtualRange(-20, 100, 20, 4, 4)).toEqual({ start: 0, end: 13, count: 13 });
    });

    it("reveals rows with footer space without moving already visible rows", () => {
        expect(revealRow(100, 100, 20, 6)).toBe(100);
        expect(revealRow(100, 100, 20, 2)).toBe(40);
        expect(revealRow(100, 100, 20, 10)).toBe(120);
        expect(revealRow(100, 100, 20, 9, 30)).toBe(130);
    });
});
