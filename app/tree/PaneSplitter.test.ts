import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import type { PaneSide } from "./placement";
import PaneSplitter from "./PaneSplitter.svelte";
import "../global.css";

function mount(side: PaneSide, rtl = false) {
    let shell = mountShell(400);
    shell.style.cssText += "; position: relative; height: 300px";
    if (rtl) shell.dir = "rtl";
    let sizes: number[] = [];
    let view = render(PaneSplitter, { target: shell, props: { side, size: 300, min: 180, max: 450, label: "Resize", onResize: (size: number) => sizes.push(size) } });
    return { ...view, sizes, splitter: view.getByRole("separator") };
}

describe("pane splitter", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => { await cleanupMocks(); });

    it("is vertical for a left or right pane and horizontal for a top or bottom one", () => {
        expect(mount("left").splitter.getAttribute("aria-orientation")).toBe("vertical");
        expect(mount("right").splitter.getAttribute("aria-orientation")).toBe("vertical");
        expect(mount("top").splitter.getAttribute("aria-orientation")).toBe("horizontal");
        expect(mount("bottom").splitter.getAttribute("aria-orientation")).toBe("horizontal");
    });

    it("reports its range and value", () => {
        let { splitter } = mount("left");
        expect(splitter.getAttribute("aria-valuemin")).toBe("180");
        expect(splitter.getAttribute("aria-valuemax")).toBe("450");
        expect(splitter.getAttribute("aria-valuenow")).toBe("300");
        expect(splitter.getAttribute("aria-label")).toBe("Resize");
        expect(splitter.tabIndex).toBe(0);
    });

    // the arrow moves the separator, so it grows a pane that sits before it and shrinks one that sits after
    let cases: { side: PaneSide; grow: string; shrink: string }[] = [
        { side: "left", grow: "ArrowRight", shrink: "ArrowLeft" },
        { side: "right", grow: "ArrowLeft", shrink: "ArrowRight" },
        { side: "top", grow: "ArrowDown", shrink: "ArrowUp" },
        { side: "bottom", grow: "ArrowUp", shrink: "ArrowDown" },
    ];
    for (let { side, grow, shrink } of cases) {
        it(`steps 24px with the arrows, Home and End on a ${side} pane`, async () => {
            let { splitter, sizes } = mount(side);
            await fireEvent.keyDown(splitter, { key: grow });
            await fireEvent.keyDown(splitter, { key: shrink });
            await fireEvent.keyDown(splitter, { key: "Home" });
            await fireEvent.keyDown(splitter, { key: "End" });
            // the cross-axis arrows do nothing
            await fireEvent.keyDown(splitter, { key: side === "left" || side === "right" ? "ArrowUp" : "ArrowLeft" });
            expect(sizes).toEqual([324, 276, 180, 450]);
        });
    }

    it("mirrors the horizontal arrows in right-to-left text", async () => {
        let left = mount("left", true);
        await fireEvent.keyDown(left.splitter, { key: "ArrowLeft" });
        expect(left.sizes).toEqual([324]);
        let right = mount("right", true);
        await fireEvent.keyDown(right.splitter, { key: "ArrowRight" });
        expect(right.sizes).toEqual([324]);
    });

    it("grows a left pane when dragged right, and a bottom pane when dragged up", async () => {
        let left = mount("left");
        await fireEvent.pointerDown(left.splitter, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
        await fireEvent.pointerMove(left.splitter, { clientX: 130, clientY: 50, pointerId: 1 });
        expect(left.sizes.at(-1)).toBe(330);
        expect(left.splitter.classList.contains("dragging")).toBe(true);
        await fireEvent.pointerUp(left.splitter, { pointerId: 1 });
        expect(left.splitter.classList.contains("dragging")).toBe(false);
        let bottom = mount("bottom");
        await fireEvent.pointerDown(bottom.splitter, { button: 0, clientX: 50, clientY: 200, pointerId: 2 });
        await fireEvent.pointerMove(bottom.splitter, { clientX: 50, clientY: 160, pointerId: 2 });
        expect(bottom.sizes.at(-1)).toBe(340);
    });
});
