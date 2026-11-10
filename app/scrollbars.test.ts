import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./global.css";
import "./scrollbars.css";
import { autoHideScrollbars, scrollbarAt } from "./scrollbars";
import { mountShell } from "./controls/test/shell";

describe("auto-hiding scrollbars", () => {
    let shell: HTMLDivElement;
    let scroller: HTMLDivElement;
    let action: { destroy(): void };
    let active = () => scroller.hasAttribute("data-scrollbar-active");

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
        shell = mountShell(400);
        scroller = document.createElement("div");
        scroller.style.cssText = "width: 200px; height: 100px; overflow: auto";
        scroller.innerHTML = `<div style="height: 1000px"></div>`;
        shell.append(scroller);
        action = autoHideScrollbars(shell);
    });
    afterEach(() => { action.destroy(); shell.remove(); vi.useRealTimers(); });

    function pointer(type: string, x: number, y: number, buttons = 0) {
        scroller.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y, pointerType: "mouse", buttons }));
    }
    let bounds = () => scroller.getBoundingClientRect();
    // the middle of the vertical bar, and a point inside the content just beside it
    let onBar = () => ({ x: bounds().right - 3, y: bounds().top + 50 });
    // overlay bars in headless browsers take no width; the styled track is then the bar's band
    let band = () => (scroller.offsetWidth - scroller.clientWidth) || 10;
    let besideBar = () => ({ x: bounds().right - band() - 12, y: bounds().top + 50 });

    it("finds the bar itself, not the content next to it", () => {
        expect(scrollbarAt(scroller, onBar().x, onBar().y)).toBe("vertical");
        expect(scrollbarAt(scroller, besideBar().x, besideBar().y)).toBeNull();
    });

    it("shows for a scroll the person made, and not for one the app made", async () => {
        scroller.scrollTop = 200;
        scroller.dispatchEvent(new Event("scroll"));
        expect(active()).toBe(false);
        scroller.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
        scroller.scrollTop = 300;
        scroller.dispatchEvent(new Event("scroll"));
        expect(active()).toBe(true);
        vi.advanceTimersByTime(1000);
        expect(active()).toBe(false);
    });

    it("shows while the bar is hovered and hides soon after the pointer leaves it", () => {
        pointer("pointermove", onBar().x, onBar().y);
        expect(active()).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(active()).toBe(true);
        pointer("pointermove", besideBar().x - 40, besideBar().y);
        expect(active()).toBe(true);
        vi.advanceTimersByTime(800);
        expect(active()).toBe(false);
    });

    it("does not grab the bar for a press near the edge, so nothing lingers", () => {
        pointer("pointerdown", besideBar().x, besideBar().y, 1);
        pointer("pointermove", besideBar().x - 40, besideBar().y, 1);
        vi.advanceTimersByTime(2000);
        expect(active()).toBe(false);
    });

    it("lets go of a dragged bar even when the release never arrives", () => {
        pointer("pointerdown", onBar().x, onBar().y, 1);
        expect(active()).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(active()).toBe(true);
        // the release was swallowed; the next move without a button ends the drag
        pointer("pointermove", besideBar().x - 40, besideBar().y, 0);
        vi.advanceTimersByTime(800);
        expect(active()).toBe(false);
    });

    it("lets go on a release that a component stops from bubbling", () => {
        let stopper = (event: Event) => event.stopPropagation();
        scroller.addEventListener("pointerup", stopper);
        pointer("pointerdown", onBar().x, onBar().y, 1);
        pointer("pointerup", onBar().x, onBar().y, 0);
        pointer("pointermove", besideBar().x - 40, besideBar().y, 0);
        vi.advanceTimersByTime(800);
        expect(active()).toBe(false);
        scroller.removeEventListener("pointerup", stopper);
    });
});
