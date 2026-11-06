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

    it.each([1440, 768, 390, 320].flatMap(width => ["light", "dark"].flatMap(theme => ["single", "stacked", "split"].map(arrangement => ({ width, theme, arrangement })))))("keeps view headers and tools distinct at $width px, $theme, $arrangement", async ({ width, theme, arrangement }) => {
        await ctx.page.setViewportSize({ width, height: 960 });
        await ctx.page.goto(`${url}/?inspect=main`);
        await ctx.page.evaluate(({ theme, arrangement }) => {
            let group = (active: string, panels = [active]) => ({ type: "tabs", active, panels });
            let root = arrangement === "single" ? group("diff") : arrangement === "stacked" ? group("diff", ["timeline", "description", "diff", "tree"]) : {
                type: "split", direction: "row", ratio: .42, first: group("timeline"),
                second: { type: "split", direction: "column", ratio: .34, first: group("description"), second: { type: "split", direction: "row", ratio: .32, first: group("tree"), second: group("diff") } },
            };
            localStorage.setItem("gg.ui.theme", theme);
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root, compactActive: "diff" }));
        }, { theme, arrangement });
        await ctx.page.reload();
        await ctx.page.getByRole("group", { name: "Diff tools", exact: true }).waitFor();
        let tops = await ctx.page.locator(".panel-view-top:visible").evaluateAll(elements => elements.map(top => {
            let rect = top.getBoundingClientRect();
            let tabs = top.querySelector("[role=tablist]");
            let bar = top.querySelector("[data-panel-bar]")!.getBoundingClientRect();
            let toolbar = top.querySelector("[data-panel-toolbar]");
            let tools = toolbar?.getBoundingClientRect();
            let controls = [...top.querySelectorAll("[data-panel-toolbar] button, .panel-close")].filter(button => !button.closest("[role=tablist]")).map(button => button.getBoundingClientRect());
            return { tabCount: tabs?.querySelectorAll("[role=tab]").length ?? 0, titleCount: top.querySelectorAll(".panel-title").length,
                tabsContainTools: !!tabs?.contains(toolbar), toolsTop: tools?.top, barBottom: bar.bottom,
                single: !!top.querySelector(".panel-titlebar"),
                controls: controls.map(control => ({ left: control.left, right: control.right, top: control.top, bottom: control.bottom, width: control.width, height: control.height })),
                rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
        }));
        expect(tops.length).toBeGreaterThan(0);
        for (let top of tops) {
            if (top.tabCount) {
                expect(top.tabCount).toBeGreaterThan(1);
                expect(top.titleCount).toBe(0);
                expect(top.tabsContainTools).toBe(false);
                if (top.toolsTop !== undefined) expect(top.toolsTop).toBeGreaterThanOrEqual(top.barBottom);
            } else {
                expect(top.titleCount).toBe(1);
                if (top.toolsTop !== undefined) expect(top.toolsTop).toBeLessThan(top.barBottom);
            }
            for (let control of top.controls) {
                expect(control.width).toBeGreaterThanOrEqual(width > 600 ? 28 : 44);
                expect(control.height).toBe(width > 600 ? 28 : 44);
                expect(control.left).toBeGreaterThanOrEqual(top.rect.left + 12);
                if (!top.single || width > 320) expect(control.right).toBeLessThanOrEqual(top.rect.right - 12);
                expect(control.top - top.rect.top).toBeGreaterThanOrEqual(5);
                expect(top.rect.bottom - control.bottom).toBeGreaterThanOrEqual(5);
            }
        }
        if (arrangement === "single") expect(await ctx.page.locator(".workspace-dock [role=tablist]").count()).toBe(0);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        let wrap = ctx.page.getByRole("button", { name: "Wrap lines", exact: true });
        let pressed = await wrap.getAttribute("aria-pressed");
        await wrap.click();
        await expect.poll(() => wrap.getAttribute("aria-pressed")).not.toBe(pressed);
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
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
        expect(await ctx.page.locator("#panel-tab-tree").getAttribute("aria-selected")).toBeNull();
        expect(await ctx.page.locator("#panel-tree").getAttribute("role")).toBe("region");
        await ctx.page.reload();
        await ctx.page.locator("#panel-tab-tree").waitFor();
        expect(await ctx.page.locator(".workspace-dock [role=tab]").count()).toBe(0);
        expect(await ctx.page.getByRole("button", { name: "Files", exact: true }).count()).toBe(1);
    });

});
