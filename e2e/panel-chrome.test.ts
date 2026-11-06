import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("shared panel chrome", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        await mkdir("e2e/results/title-bars", { recursive: true });
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it.each([1440, 768, 390, 320].flatMap(width => ["light", "dark"].flatMap(theme => ["single", "stacked", "split"].map(arrangement => ({ width, theme, arrangement })))))("keeps a quiet title line above unified controls at $width px, $theme, $arrangement", async ({ width, theme, arrangement }) => {
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
            let controls = [...top.querySelectorAll("[data-panel-toolbar] button, .panel-close")].filter(button => !button.closest("[role=tablist]")).map(button => ({ bounds: button.getBoundingClientRect(), close: button.classList.contains("panel-close") }));
            return { tabCount: tabs?.querySelectorAll("[role=tab]").length ?? 0, titleCount: top.querySelectorAll(".panel-title").length,
                tabsContainTools: !!tabs?.contains(toolbar), toolsTop: tools?.top, toolsBottom: tools?.bottom, toolsScrollable: toolbar ? toolbar.scrollWidth > toolbar.clientWidth : false, barBottom: bar.bottom, barHeight: bar.height,
                single: !!top.querySelector(".panel-titlebar"),
                controls: controls.map(({ bounds: control, close }) => ({ close, left: control.left, right: control.right, top: control.top, bottom: control.bottom, width: control.width, height: control.height })),
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
                if (top.toolsTop !== undefined) expect(top.toolsTop).toBeGreaterThanOrEqual(top.barBottom);
            }
            expect(top.barHeight).toBe(width > 600 ? 40 : 56);
            if (top.toolsBottom !== undefined) expect(top.toolsBottom).toBeGreaterThan(top.barBottom);
            for (let control of top.controls) {
                if (control.close && width > 600) expect([0, 24]).toContain(Math.round(control.width));
                else expect(control.width).toBeGreaterThanOrEqual(width > 600 ? 28 : 44);
                expect(control.height).toBe(width > 600 ? 28 : 44);
                if (!top.toolsScrollable) {
                    expect(control.left).toBeGreaterThanOrEqual(top.rect.left + 12);
                    expect(control.right).toBeLessThanOrEqual(top.rect.right - 12);
                }
                expect(control.top - top.rect.top).toBeGreaterThanOrEqual(5);
                expect(top.rect.bottom - control.bottom).toBeGreaterThanOrEqual(5);
            }
        }
        if (arrangement === "stacked") await ctx.page.screenshot({ path: `e2e/results/title-bars/${theme}-${width}.png` });
        if (arrangement === "single") expect(await ctx.page.locator(".workspace-dock [role=tablist]").count()).toBe(0);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        let wrap = ctx.page.getByRole("button", { name: "Wrap lines", exact: true });
        let pressed = await wrap.getAttribute("aria-pressed");
        await wrap.click();
        await expect.poll(() => wrap.getAttribute("aria-pressed")).not.toBe(pressed);
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
    });
    it.each([768, 390, 320])("scrolls overflowing tabs independently of view tools and reveals keyboard focus at %ipx", async width => {
        await ctx.page.setViewportSize({ width, height: 960 });
        await ctx.page.goto(`${url}/?inspect=main`);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", panels: ["timeline", "description", "diff", "tree", "edit", "evolution", "history", "revision-tools", "operation", "settings"], active: "diff" }, compactActive: "diff" })));
        await ctx.page.reload();
        let tabs = ctx.page.getByRole("tablist", { name: "Panels", exact: true });
        let tools = ctx.page.getByRole("group", { name: "Diff tools", exact: true });
        await tools.waitFor();
        let viewport = await tabs.boundingBox(), fixed = await tools.boundingBox();
        expect(fixed!.y).toBeGreaterThanOrEqual(viewport!.y + viewport!.height);
        expect(await tabs.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await tabs.evaluate(element => element.scrollLeft = 0);
        let origin = await tools.boundingBox();
        await tabs.evaluate(element => element.scrollLeft = element.scrollWidth);
        expect(await tools.boundingBox()).toEqual(origin);
        // programmatic focus uses the same roving tab entry point as keyboard navigation.
        let active = ctx.page.getByRole("tab", { name: "Diff", exact: true });
        await active.focus();
        await expect.poll(async () => {
            let tab = (await active.boundingBox())!, strip = (await tabs.boundingBox())!;
            return tab.x >= strip.x - 1 && tab.x < strip.x + strip.width - 12;
        }).toBe(true);
        // narrow panes keep full-size controls and scroll the toolbar independently.
        let top = tabs.locator("../..");
        await top.evaluate(element => element.style.maxWidth = "140px");
        expect((await top.locator("[data-panel-bar]").boundingBox())!.height).toBe(width > 600 ? 40 : 56);
        let toolViewport = top.locator("[data-panel-toolbar]");
        expect(await toolViewport.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        for (let button of await tools.getByRole("button").all()) {
            await button.focus();
            await expect.poll(async () => {
                let target = (await button.boundingBox())!, area = (await toolViewport.boundingBox())!;
                return target.x >= area.x - 1 && target.x + target.width <= area.x + area.width + 1;
            }).toBe(true);
        }
        await top.evaluate(element => element.style.maxWidth = "");
        await active.focus();
        await active.press("Home");
        let first = ctx.page.getByRole("tab", { name: "Timeline", exact: true });
        await expect.poll(() => first.getAttribute("aria-selected")).toBe("true");
        await first.press("End");
        let last = ctx.page.getByRole("tab", { name: "Settings", exact: true });
        await expect.poll(() => last.getAttribute("aria-selected")).toBe("true");
        expect(await ctx.page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Settings");
        await ctx.page.getByRole("button", { name: "Close Settings", exact: true }).focus();
        await ctx.page.keyboard.press("Enter");
        expect(await ctx.page.getByRole("tab", { name: "Settings", exact: true }).count()).toBe(0);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    it("remembers a view’s collapsed toolbar across tab changes and responsive remounts", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=main`);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", panels: ["timeline", "diff", "tree"], active: "diff" }, compactActive: "diff" })));
        await ctx.page.reload();
        let hide = ctx.page.getByRole("button", { name: "Hide Diff toolbar", exact: true });
        await hide.click();
        expect(await ctx.page.getByRole("button", { name: "Wrap lines", exact: true }).count()).toBe(0);
        await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Hide Timeline toolbar" }).waitFor();
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Show Diff toolbar" }).waitFor();
        await ctx.page.setViewportSize({ width: 390, height: 960 });
        let show = ctx.page.getByRole("button", { name: "Show Diff toolbar" });
        await show.waitFor();
        await show.focus();
        await show.press("Enter");
        await ctx.page.getByRole("button", { name: "Wrap lines", exact: true }).waitFor();
        expect(await ctx.page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("Hide Diff toolbar");
        await ctx.page.getByRole("tab", { name: "Files", exact: true }).click();
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("c.txt");
        await ctx.page.getByRole("button", { name: "Hide Files toolbar" }).click();
        expect(await search.count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Show Files toolbar" }).click();
        expect(await search.inputValue()).toBe("c.txt");
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
        await ctx.page.locator("#panel-tab-timeline").hover();
        await expect.poll(async () => (await closeTimeline.boundingBox())!.width).toBe(24);
        let closeBox = (await closeTimeline.boundingBox())!;
        await ctx.page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height + 20, { steps: 6 });
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.mouse.up();
        expect(await ctx.page.locator("#panel-tab-timeline").count()).toBe(1);
        await ctx.page.locator("#panel-tab-timeline").hover();
        await closeTimeline.click();
        expect(await ctx.page.locator("#panel-tab-timeline").count()).toBe(0);
        expect(await active.getAttribute("aria-selected")).toBe("true");
        expect(await ctx.page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-description");
        expect(await ctx.page.locator(".dock-drag-ghost").count()).toBe(0);
        await ctx.page.locator("#panel-tab-description").hover();
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
