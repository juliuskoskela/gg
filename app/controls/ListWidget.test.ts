import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";

describe("list keyboard paging", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());

    it("pages by the visible revision row pitch", async () => {
        let { default: ListWidget } = await import("./ListWidget.svelte");
        let { revisionRowHeight } = await import("../graphLayout");
        let selected = 0;
        let selectRow = vi.fn((row: number) => { selected = row; });
        let list = {
            getSize: () => 100,
            getSelection: () => ({ from: selected, to: selected }),
            selectRow,
            extendSelection: vi.fn(),
            editRow: vi.fn(),
        };
        let { getByRole, rerender } = render(ListWidget, { props: { list, type: "Revision", rowHeight: revisionRowHeight } });
        let box = getByRole("listbox");
        await rerender({ list, type: "Revision", rowHeight: revisionRowHeight, descendant: "selected-revision" });
        expect(box.getAttribute("aria-activedescendant")).toBe("Revision-selected-revision");
        box.style.height = `${revisionRowHeight * 5}px`;

        await fireEvent.keyDown(box, { key: "PageDown" });
        expect(selectRow).toHaveBeenLastCalledWith(5);
        await fireEvent.keyDown(box, { key: "PageUp" });
        expect(selectRow).toHaveBeenLastCalledWith(0);
        await fireEvent.keyDown(box, { key: "End" });
        expect(selectRow).toHaveBeenLastCalledWith(99);
    });
    it("consumes boundary arrow keys without selecting an invalid row", async () => {
        let { default: ListWidget } = await import("./ListWidget.svelte");
        let selectRow = vi.fn();
        let list = {
            getSize: () => 3,
            getSelection: () => ({ from: 0, to: 0 }),
            selectRow,
            extendSelection: vi.fn(),
            editRow: vi.fn(),
        };
        let { getByRole } = render(ListWidget, { props: { list, type: "Revision" } });
        let key = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
        getByRole("listbox").dispatchEvent(key);
        expect(key.defaultPrevented).toBe(true);
        expect(selectRow).not.toHaveBeenCalled();
    });

});
