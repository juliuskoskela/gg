import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("shared panel chrome", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it.each([1440, 390, 320])("pairs close controls with tabs and keeps tools spaced at %ipx", async width => {
        await ctx.page.setViewportSize({ width, height: 960 });
        await ctx.page.goto(`${url}/?inspect=main`);
        await ctx.page.locator("#panel-tab-diff").click();
        await ctx.page.getByRole("group", { name: "Diff tools", exact: true }).waitFor();
        let bars = await ctx.page.locator(".panel-tabs-layout:visible").evaluateAll(elements => elements.map(bar => {
            let rect = bar.getBoundingClientRect();
            let item = bar.querySelector("[role=tab][aria-selected=true]")!.parentElement!;
            let close = item.querySelector(".panel-close")!.getBoundingClientRect();
            let trigger = item.querySelector("[role=tab]")!.getBoundingClientRect();
            let tabs = bar.querySelector(".panel-tabs")!.getBoundingClientRect();
            let tools = bar.querySelector(".panel-header-tools")?.getBoundingClientRect();
            let controls = [...bar.querySelectorAll(".panel-header-tools button")].map(button => button.getBoundingClientRect());
            return { leftInset: tabs.left - rect.left, closeStart: close.left, triggerEnd: trigger.right, closeSize: close.width,
                rightInset: tools ? rect.right - tools.right : null, controls: controls.map(control => ({ left: control.left, right: control.right, top: control.top, bottom: control.bottom, width: control.width, height: control.height })), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
        }));
        for (let bar of bars) {
            expect(bar.leftInset).toBe(12);
            expect(bar.closeStart - bar.triggerEnd).toBeGreaterThanOrEqual(0);
            expect(bar.closeStart - bar.triggerEnd).toBeLessThanOrEqual(8);
            expect(bar.closeSize).toBe(width > 600 ? 28 : 44);
            if (bar.rightInset !== null) expect(Math.abs(bar.rightInset - 12)).toBeLessThan(1);
            for (let control of bar.controls) {
                expect(control.width).toBeGreaterThanOrEqual(width > 600 ? 28 : 44);
                expect(control.height).toBe(width > 600 ? 28 : 44);
                expect(control.left).toBeGreaterThanOrEqual(bar.rect.left + 12);
                expect(control.right).toBeLessThanOrEqual(bar.rect.right - 12);
                expect(control.top - bar.rect.top).toBeGreaterThanOrEqual(5);
                expect(bar.rect.bottom - control.bottom).toBeGreaterThanOrEqual(5);
            }
        }
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        let wrap = ctx.page.getByRole("button", { name: "Wrap lines", exact: true });
        let pressed = await wrap.getAttribute("aria-pressed");
        await wrap.click();
        await expect.poll(() => wrap.getAttribute("aria-pressed")).not.toBe(pressed);
    });
    it("closes inactive and active tabs without starting a drag or changing the wrong selection", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=main`);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", panels: ["timeline", "description", "diff", "tree"], active: "description" }, compactActive: "description" })));
        await ctx.page.reload();
        let active = ctx.page.locator("#panel-tab-description");
        await active.waitFor();
        expect(await active.getAttribute("aria-selected")).toBe("true");
        let closeTimeline = ctx.page.getByRole("button", { name: "Close Timeline", exact: true });
        let closeBox = (await closeTimeline.boundingBox())!;
        await ctx.page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height + 20, { steps: 6 });
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.mouse.up();
        expect(await ctx.page.locator("#panel-tab-timeline").count()).toBe(1);
        await closeTimeline.click();
        expect(await ctx.page.locator("#panel-tab-timeline").count()).toBe(0);
        expect(await active.getAttribute("aria-selected")).toBe("true");
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-description");
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Close Description", exact: true }).click();
        expect(await ctx.page.locator("#panel-tab-description").count()).toBe(0);
        expect(await ctx.page.locator("#panel-tab-diff").getAttribute("aria-selected")).toBe("true");
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-diff");
        await ctx.page.locator("#panel-tab-diff").press("Delete");
        expect(await ctx.page.locator("#panel-tab-diff").count()).toBe(0);
        expect(await ctx.page.locator("#panel-tab-tree").getAttribute("aria-selected")).toBe("true");
        await ctx.page.reload();
        await ctx.page.locator("#panel-tab-tree").waitFor();
        expect(await ctx.page.locator(".workspace-dock [role=tab]").count()).toBe(1);
    });

});
