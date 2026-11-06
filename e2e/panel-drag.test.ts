import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Locator } from "@playwright/test";
import type { DockNode } from "../app/workspace/dock";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

let storageKey = "gg.dock.layout";

describe("pointer docking", () => {
    let ctx: TestContext;
    let url: string;

    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
        await ctx.page.setViewportSize({ width: 1400, height: 900 });
        await ctx.page.goto(`${url}/?inspect=main`);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    beforeEach(async () => {
        await ctx.page.evaluate(key => localStorage.removeItem(key), storageKey);
        await ctx.page.reload();
        await ctx.page.locator("#panel-tab-description").waitFor({ state: "visible" });
        await ctx.page.locator("#panel-tab-timeline").waitFor({ state: "visible" });
    });

    function group(panel: string) {
        return ctx.page.locator(".tabs[data-panel-group]").filter({ has: ctx.page.locator(`#panel-tab-${panel}`) });
    }
    async function root(): Promise<DockNode> {
        return ctx.page.evaluate(key => JSON.parse(localStorage.getItem(key)!).root, storageKey);
    }
    async function bounds(locator: Locator) {
        await locator.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
        let box = await locator.boundingBox();
        if (!box) throw new Error(`Missing visible docking target: ${locator}`);
        return box;
    }
    async function pickUp(panel: string) {
        let tab = await bounds(ctx.page.locator(`#panel-tab-${panel}`));
        let x = tab.x + tab.width / 2;
        let y = tab.y + tab.height / 2;
        await ctx.page.mouse.move(x, y);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(x + 12, y + 12, { steps: 4 });
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").isVisible()).toBe(true);
    }
    async function expectPreview(edge: string, target?: string) {
        let preview = ctx.page.locator(`.dock-drop-preview[data-edge='${edge}']`);
        await expect.poll(() => preview.isVisible()).toBe(true);
        if (target) expect(await preview.getAttribute("data-target")).toBe(target);
        let box = await bounds(preview);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1401);
        expect(box.y + box.height).toBeLessThanOrEqual(901);
    }
    async function finishDrop() {
        await ctx.page.mouse.up();
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await expect.poll(() => ctx.page.locator(".dock-drop-preview").count()).toBe(0);
    }
    async function groupDescriptionWithTimeline() {
        let initial = await root();
        let target = await bounds(group("timeline"));
        await pickUp("description");
        // the body center groups tabs without depending on native HTML drag events
        await ctx.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 16 });
        await expectPreview("tab", "timeline");
        expect(await root()).toEqual(initial);
        await finishDrop();
        await expect.poll(() => group("timeline").locator("#panel-tab-description").count()).toBe(1);
        expect(await ctx.page.locator("#panel-tab-description").getAttribute("aria-selected")).toBe("true");
        expect(await group("timeline").getAttribute("data-panel-group")).toBe("description");
        expect(flatPanels(await root()).filter(panel => panel === "description")).toHaveLength(1);
    }
    async function persist(expected: DockNode) {
        await ctx.page.reload();
        await ctx.page.locator("#panel-tab-description").waitFor({ state: "visible" });
        await expect.poll(root).toEqual(expected);
        expect(flatPanels(await root()).sort()).toEqual(["description", "diff", "timeline", "tree"]);
    }

    it("shows plain draggable titles until views are stacked", async () => {
        expect(await ctx.page.locator(".workspace-dock [role=tablist]").count()).toBe(0);
        expect(await ctx.page.locator(".workspace-dock .panel-grip").count()).toBe(0);
        await groupDescriptionWithTimeline();
        expect(await group("timeline").getByRole("tablist").count()).toBe(1);
        expect(await group("timeline").locator(".panel-grip").count()).toBe(0);
        await ctx.page.locator("#panel-tab-description").hover();
        await ctx.page.getByRole("button", { name: "Close Description", exact: true }).click();
        expect(await group("timeline").getByRole("tablist").count()).toBe(0);
        expect(await group("timeline").getByRole("button", { name: "Timeline", exact: true }).count()).toBe(1);
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-timeline");
    });

    it.each(["right", "bottom"] as const)("groups a tab then detaches the active tab onto its own group’s %s edge", async edge => {
        await groupDescriptionWithTimeline();
        let grouped = await root();
        let target = await bounds(group("timeline"));
        await pickUp("description");
        let x = edge === "right" ? target.x + target.width - 12 : target.x + target.width / 2;
        let y = edge === "bottom" ? target.y + target.height - 12 : target.y + target.height / 2;
        await ctx.page.mouse.move(x, y, { steps: 16 });
        await expectPreview(edge);
        let predicted = await bounds(ctx.page.locator(".dock-drop-preview"));
        expect(await root()).toEqual(grouped);
        await finishDrop();
        await expect.poll(() => group("timeline").locator("#panel-tab-description").count()).toBe(0);
        expect(await group("timeline").getAttribute("data-panel-group")).toBe("timeline");
        expect(await group("description").getAttribute("data-panel-group")).toBe("description");
        let timeline = await bounds(group("timeline"));
        let description = await bounds(group("description"));
        for (let key of ["x", "y", "width", "height"] as const) expect(Math.abs(description[key] - predicted[key])).toBeLessThan(2);
        if (edge === "right") {
            expect(description.x).toBeGreaterThanOrEqual(timeline.x + timeline.width);
            expect(Math.abs(description.y - timeline.y)).toBeLessThan(2);
        } else {
            expect(description.y).toBeGreaterThanOrEqual(timeline.y + timeline.height);
            expect(Math.abs(description.x - timeline.x)).toBeLessThan(2);
        }
        await persist(await root());
        expect(await group("timeline").locator("#panel-tab-description").count()).toBe(0);
    });

    it("moves a panel with Space, Tab, arrows and Enter while retaining source focus", async () => {
        let initial = await root();
        let source = ctx.page.locator("#panel-tab-timeline");
        await source.focus();
        await ctx.page.keyboard.press("Space");
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").isVisible()).toBe(true);
        await ctx.page.keyboard.press("Tab");
        await expectPreview("tab", "description");
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-timeline");
        await ctx.page.keyboard.press("ArrowRight");
        await expectPreview("right", "description");
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-timeline");
        expect(await root()).toEqual(initial);
        let predicted = await bounds(ctx.page.locator(".dock-drop-preview"));
        await ctx.page.keyboard.press("Enter");
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await expect.poll(root).not.toEqual(initial);
        await expect.poll(() => ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-timeline");
        let timeline = await bounds(group("timeline"));
        let description = await bounds(group("description"));
        for (let key of ["x", "y", "width", "height"] as const) expect(Math.abs(timeline[key] - predicted[key])).toBeLessThan(2);
        expect(timeline.x).toBeGreaterThanOrEqual(description.x + description.width);
        expect(Math.abs(timeline.y - description.y)).toBeLessThan(2);
        await persist(await root());
    });

    it("appends the first grouped tab at the blank end of its header without splitting", async () => {
        await groupDescriptionWithTimeline();
        let grouped = await root();
        let splitCount = (node: DockNode): number => node.type === "tabs" ? 0 : 1 + splitCount(node.first) + splitCount(node.second);
        let tabs = group("description").locator(".panel-tabs");
        expect(await tabs.getByRole("tab").allTextContents()).toEqual(["Timeline", "Description"]);
        let header = await bounds(tabs);
        await pickUp("timeline");
        await ctx.page.mouse.move(header.x + header.width - 10, header.y + header.height / 2, { steps: 16 });
        await expectPreview("tab-end", "description");
        expect(await root()).toEqual(grouped);
        await finishDrop();
        await expect.poll(() => group("description").locator(".panel-tabs").getByRole("tab").allTextContents()).toEqual(["Description", "Timeline"]);
        expect(splitCount(await root())).toBe(splitCount(grouped));
        expect(await group("description").getAttribute("data-panel-group")).toBe("timeline");
        await persist(await root());
        expect(await group("description").locator(".panel-tabs").getByRole("tab").allTextContents()).toEqual(["Description", "Timeline"]);
    });

    it("drops outside the workspace without moving or splitting a panel", async () => {
        let initial = await root();
        let target = await bounds(group("timeline"));
        await pickUp("description");
        await ctx.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 16 });
        await expectPreview("tab", "timeline");
        await ctx.page.mouse.move(2, 2, { steps: 16 });
        await expect.poll(() => ctx.page.locator(".dock-drop-preview").count()).toBe(0);
        expect(await ctx.page.locator(".dock-drag-ghost").isVisible()).toBe(true);
        await finishDrop();
        expect(await root()).toEqual(initial);
        await persist(initial);
    });

    it("cancels a pending pickup before the movement threshold", async () => {
        let tab = await bounds(ctx.page.locator("#panel-tab-description"));
        await ctx.page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
        await ctx.page.mouse.down();
        await ctx.page.evaluate(() => window.dispatchEvent(new Event("pointercancel")));
        await ctx.page.mouse.move(tab.x + 30, tab.y + 70, { steps: 8 });
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.mouse.up();
        await groupDescriptionWithTimeline();
    });

    it.each(["blur", "pointercancel"])("recovers from %s and accepts a subsequent pointer drag", async interruption => {
        let initial = await root();
        let target = await bounds(group("timeline"));
        await pickUp("description");
        await ctx.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
        await expectPreview("tab");
        await ctx.page.evaluate(type => window.dispatchEvent(new Event(type)), interruption);
        await ctx.page.mouse.up();
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        expect(await ctx.page.locator(".neodrag-dragging").count()).toBe(0);
        expect(await ctx.page.evaluate(() => document.body.style.userSelect)).not.toBe("none");
        expect(await root()).toEqual(initial);
        await groupDescriptionWithTimeline();
    });

    it("cancels a preview with Escape and preserves the grouped layout after reload", async () => {
        await groupDescriptionWithTimeline();
        let grouped = await root();
        let target = await bounds(group("timeline"));
        await pickUp("description");
        await ctx.page.mouse.move(target.x + target.width - 12, target.y + target.height / 2, { steps: 16 });
        await expectPreview("right");
        await ctx.page.keyboard.press("Escape");
        await expect.poll(() => ctx.page.locator(".dock-drop-preview").count()).toBe(0);
        await expect.poll(() => ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.mouse.up();
        expect(await root()).toEqual(grouped);
        expect(await group("timeline").locator("#panel-tab-description").count()).toBe(1);
        await persist(grouped);
        expect(await group("timeline").locator("#panel-tab-description").count()).toBe(1);
    });
});

function flatPanels(node: DockNode): string[] {
    return node.type === "tabs" ? node.panels : [...flatPanels(node.first), ...flatPanels(node.second)];
}
