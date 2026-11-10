import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";
import { render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import { mountShell } from "../controls/test/shell";
import type { PaneSide } from "./placement";
import BrowserPane from "./BrowserPane.svelte";
import "../global.css";

let content = createRawSnippet(() => ({ render: () => `<div data-content style="flex: 1">content</div>` }));
let pane = createRawSnippet(() => ({ render: () => `<div data-pane>pane</div>` }));

function mount(props: Record<string, unknown> = {}, dir = "ltr", display = "flex") {
    let shell = mountShell(600);
    shell.style.cssText += `; height: 400px; display: ${display}`;
    shell.dir = dir;
    let view = render(BrowserPane, { target: shell, props: { side: "left", open: true, size: 200, onResize: () => {}, label: "Resize", content, pane, ...props } });
    let box = (selector: string) => shell.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    let element = () => shell.querySelector<HTMLElement>(".browser > .pane")!;
    return { ...view, shell, box, element };
}

describe("browser pane", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => { await cleanupMocks(); });

    it("lays the pane out before the content on the left and after it on the right", () => {
        let left = mount({ side: "left" });
        expect(left.box("[data-pane]").right).toBeLessThanOrEqual(left.box("[data-content]").left);
        expect(left.element().getBoundingClientRect().width).toBe(200);
        left.unmount();
        let right = mount({ side: "right" });
        expect(right.box("[data-pane]").left).toBeGreaterThanOrEqual(right.box("[data-content]").right);
        expect(right.element().getBoundingClientRect().width).toBe(200);
    });

    it("lays the pane out above the content on top and below it on the bottom, using its height", () => {
        let top = mount({ side: "top", size: 150 });
        expect(top.box("[data-pane]").bottom).toBeLessThanOrEqual(top.box("[data-content]").top);
        expect(top.element().getBoundingClientRect().height).toBe(150);
        top.unmount();
        let bottom = mount({ side: "bottom", size: 150 });
        expect(bottom.box("[data-pane]").top).toBeGreaterThanOrEqual(bottom.box("[data-content]").bottom);
        expect(bottom.element().getBoundingClientRect().height).toBe(150);
    });

    it("keeps left on the leading side in right-to-left text", () => {
        let view = mount({ side: "left" }, "rtl");
        expect(view.box("[data-pane]").left).toBeGreaterThan(view.box("[data-content]").left);
    });

    it("draws the seam on the pane's inner edge", () => {
        let edges: Record<PaneSide, string> = { left: "borderRightWidth", right: "borderLeftWidth", top: "borderBottomWidth", bottom: "borderTopWidth" };
        for (let side of ["left", "right", "top", "bottom"] as PaneSide[]) {
            let view = mount({ side });
            let style = getComputedStyle(view.element());
            expect(style[edges[side] as "borderTopWidth"]).toBe("1px");
            let others = Object.values(edges).filter(edge => edge !== edges[side]);
            for (let edge of others) expect(style[edge as "borderTopWidth"]).toBe("0px");
            view.unmount();
        }
    });

    it("caps the size at half the width, or 70% of the height, and floors it at the minimum", () => {
        let wide = mount({ side: "left", size: 2000 });
        expect(wide.element().getBoundingClientRect().width).toBe(300);
        wide.unmount();
        let tall = mount({ side: "bottom", size: 2000 });
        expect(tall.element().getBoundingClientRect().height).toBe(280);
        tall.unmount();
        let small = mount({ side: "left", size: 50 });
        expect(small.element().getBoundingClientRect().width).toBe(180);
    });

    it("has a splitter only while open, and a closed pane takes no room", async () => {
        let view = mount({ open: false });
        expect(view.queryByRole("separator")).toBeNull();
        expect(view.element().getBoundingClientRect().width).toBe(0);
        expect(view.queryByText("pane")).toBeNull();
        await view.rerender({ open: true });
        expect(view.getByRole("separator").getAttribute("aria-valuenow")).toBe("200");
    });

    it("keeps a closed pane mounted when asked", () => {
        let view = mount({ open: false, keepMounted: true });
        expect(view.getByText("pane")).toBeTruthy();
        expect(getComputedStyle(view.element()).visibility).toBe("hidden");
    });

    it("animates only opening and closing, never mounting, resizing or changing side", async () => {
        let view = mount({ open: true });
        expect(view.element().classList.contains("animating")).toBe(false);
        await view.rerender({ size: 260 });
        expect(view.element().classList.contains("animating")).toBe(false);
        expect(view.element().style.inlineSize).toBe("260px");
        await view.rerender({ side: "bottom" });
        expect(view.element().classList.contains("animating")).toBe(false);
        await view.rerender({ open: false });
        expect(view.element().classList.contains("animating")).toBe(true);
        await waitFor(() => expect(view.element().classList.contains("animating")).toBe(false), { timeout: 1500 });
        await view.rerender({ open: true });
        expect(view.element().classList.contains("animating")).toBe(true);
        expect(getComputedStyle(view.element()).transitionProperty).toContain("block-size");
    });

    it("keeps the remembered size while the view is unmeasured", async () => {
        // a remounting view has not measured itself yet
        let view = mount({ size: 520 }, "ltr", "none");
        expect(view.element().style.inlineSize).toBe("520px");
        await view.rerender({ size: 521 });
        expect(view.element().style.inlineSize).toBe("521px");
        expect(view.element().classList.contains("animating")).toBe(false);
        view.shell.style.display = "flex";
        await waitFor(() => expect(view.element().style.inlineSize).toBe("300px"));
        expect(view.element().classList.contains("animating")).toBe(false);
    });

    it("mounts closed or open without animating", () => {
        expect(mount({ open: false }).element().classList.contains("animating")).toBe(false);
    });
});
