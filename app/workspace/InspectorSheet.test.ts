import "../global.css";
import { cdp, page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import InspectorSheet from "./InspectorSheet.svelte";
import type { Query } from "../events";
import type { RevsResult } from "../messages/RevsResult";

let wait: Query<RevsResult> = { type: "wait" };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount(presentation: "collapsed" | "half" = "half") {
    let onPresentation = vi.fn();
    let result = render(InspectorSheet, { selection: wait, presentation, onPresentation, onFull: vi.fn() });
    result.container.id = "shell";
    result.container.className = "light";
    result.container.style.cssText = "position:relative;height:800px;width:390px";
    let sheet = result.container.querySelector<HTMLElement>(".inspector-sheet")!;
    let handle = result.getByRole("button", { name: /revision preview/ });
    vi.spyOn(handle, "setPointerCapture").mockImplementation(() => {});
    vi.spyOn(handle, "hasPointerCapture").mockReturnValue(false);
    await expect.poll(() => sheet.clientHeight).toBeGreaterThan(100);
    // allow the real browser ResizeObserver to establish the sheet's travel bounds.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ...result, sheet, handle, onPresentation };
}

async function pointer(node: HTMLElement, type: string, pointerId: number, clientY: number) {
    await fireEvent(node, new PointerEvent(type, { bubbles: true, pointerId, clientY, button: 0 }));
}

describe("inspector sheet gestures", () => {
    it("preserves controls and removes sheet travel for reduced motion", async () => {
        await (cdp() as unknown as { send(command: string, parameters: object): Promise<void> }).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
        expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
        let { sheet, handle, onPresentation } = await mount();
        expect(getComputedStyle(sheet).transitionDuration).toBe("0s");
        await fireEvent.click(handle, { detail: 0 });
        expect(onPresentation).toHaveBeenCalledWith("collapsed");
        await (cdp() as unknown as { send(command: string, parameters: object): Promise<void> }).send("Emulation.setEmulatedMedia", { features: [] });
    });
    it("shows a legible collapsed identity and a distinct handle at phone width", async () => {
        await page.viewport(390, 844);
        let { sheet, rerender } = await mount("collapsed");
        let id = { change: { type: "ChangeId" as const, hex: "abcdefghijk", prefix: "a", rest: "bcdefghijk", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "0123456789abcdef", prefix: "0", rest: "123456789abcdef" } };
        await rerender({ selection: { type: "data", value: { type: "Detail", set: { from: id, to: id }, headers: [{ id, description: { lines: ["Keep revision identity visible during review", "Preserve graph selection and reading position."] }, author: { name: "Julius Koskela", email: "julius@example.com", timestamp: "2026-11-05T12:00:00Z" }, refs: [], parent_ids: [], has_conflict: false, is_immutable: false, is_working_copy: true, working_copy_of: null }], parents: [], changes: [], conflicts: [] } } });
        await rerender({ presentation: "half" });
        expect(sheet.getBoundingClientRect().width).toBe(390);
    });
    it("tracks only the handle, clamps travel, ignores secondary pointers and settles after release", async () => {
        let { sheet, handle, onPresentation } = await mount();
        let content = sheet.querySelector<HTMLElement>(".preview-scroll")!;
        await pointer(content, "pointerdown", 1, 100);
        await pointer(content, "pointermove", 1, 200);
        expect(sheet.style.transform).toBe("");
        await pointer(handle, "pointerdown", 1, 100);
        await pointer(handle, "pointermove", 1, 190);
        expect(sheet.style.transform).toBe("translateY(90px)");
        await pointer(handle, "pointermove", 2, 900);
        expect(sheet.style.transform).toBe("translateY(90px)");
        await pointer(handle, "pointermove", 1, -100);
        expect(sheet.style.transform).toBe("translateY(0px)");
        await pointer(handle, "pointermove", 1, 2000);
        expect(Number.parseFloat(sheet.style.transform.slice(11))).toBeCloseTo(sheet.clientHeight - 72, 0);
        await pointer(handle, "pointerup", 1, 2000);
        await expect.poll(() => onPresentation.mock.calls[0]?.[0]).toBe("collapsed");
        await fireEvent.click(handle, { detail: 1 });
        expect(onPresentation).toHaveBeenCalledTimes(1);
    });

    it("keeps collapsed summary taps separate from the drag surface and restores explicit controls", async () => {
        let { getByRole, sheet, handle, onPresentation } = await mount("collapsed");
        let summary = getByRole("button", { name: /^Preview revision:/ });
        await pointer(summary, "pointerdown", 1, 300);
        await pointer(summary, "pointermove", 1, 100);
        expect(sheet.style.transform).toBe("");
        expect(getComputedStyle(summary).touchAction).not.toBe("none");
        expect(getComputedStyle(handle).touchAction).toBe("none");
        expect(handle.getBoundingClientRect().width).toBe(44);
        expect(handle.getBoundingClientRect().left).toBeGreaterThanOrEqual(summary.getBoundingClientRect().right);
        await fireEvent.click(summary);
        expect(onPresentation).toHaveBeenCalledWith("half");
        expect(sheet.querySelector(".expanded-content")?.hasAttribute("inert")).toBe(true);
    });

    it("cancels capture, suppresses the follow-up pointer click, and keeps keyboard controls available", async () => {
        let { sheet, handle, onPresentation } = await mount();
        await pointer(handle, "pointerdown", 5, 100);
        await pointer(handle, "pointermove", 5, 200);
        await pointer(handle, "pointercancel", 5, 200);
        expect(sheet.style.transform).toBe("");
        await fireEvent.click(handle, { detail: 1 });
        expect(onPresentation).not.toHaveBeenCalled();
        await fireEvent.click(handle, { detail: 0 });
        expect(onPresentation).toHaveBeenCalledWith("collapsed");
    });

    it("returns to its stable state after lost capture, Escape, and viewport layout changes", async () => {
        let { container, sheet, handle, onPresentation } = await mount();
        await pointer(handle, "pointerdown", 1, 100);
        await pointer(handle, "pointermove", 1, 180);
        await pointer(handle, "lostpointercapture", 1, 180);
        expect(sheet.style.transform).toBe("");
        await pointer(handle, "pointerdown", 2, 100);
        await pointer(handle, "pointermove", 2, 180);
        await fireEvent.keyDown(window, { key: "Escape" });
        expect(sheet.style.transform).toBe("");
        await pointer(handle, "pointerdown", 3, 100);
        await pointer(handle, "pointermove", 3, 180);
        container.style.height = "250px";
        await expect.poll(() => sheet.style.transform).toBe("");
        await pointer(handle, "pointerup", 3, 500);
        expect(onPresentation).not.toHaveBeenCalled();
    });

    it("abandons an in-flight gesture when selection changes or the window is interrupted", async () => {
        let { sheet, handle, rerender, onPresentation } = await mount();
        await pointer(handle, "pointerdown", 3, 100);
        await pointer(handle, "pointermove", 3, 200);
        await rerender({ selection: { type: "error", message: "Revision unavailable" } });
        expect(sheet.style.transform).toBe("");
        await pointer(handle, "pointerup", 3, 400);
        expect(onPresentation).not.toHaveBeenCalled();
        await pointer(handle, "pointerdown", 4, 100);
        await pointer(handle, "pointermove", 4, 200);
        await fireEvent(window, new Event("blur"));
        expect(sheet.style.transform).toBe("");
        expect(onPresentation).not.toHaveBeenCalled();
    });
});
