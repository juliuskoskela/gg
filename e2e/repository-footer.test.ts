import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("repository footer", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => { ctx = await createContext(); extractTestRepo(ctx.tempDir); url = await startGG(ctx); });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it.each([320, 390, 768, 1440])("keeps remote and recovery actions visible below the workspace at %ipx", async width => {
        await ctx.page.setViewportSize({ width, height: 900 });
        await ctx.page.goto(url);
        let footer = ctx.page.getByRole("contentinfo", { name: "Repository controls" });
        await footer.waitFor();
        let bounds = (await footer.boundingBox())!;
        let content = (await ctx.page.locator(".workspace-sheet").boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(content.y + content.height - 1);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
        let sync = footer.getByRole("group", { name: "Remote synchronization" });
        expect(await sync.getByRole("combobox", { name: "Git remote" }).count()).toBe(1);
        for (let name of ["Fetch remote bookmarks", "Push all bookmarks", "Undo the latest operation", "Redo the latest undone operation", "More repository actions"]) {
            let button = footer.getByRole("button", { name, exact: true });
            expect(await button.isVisible()).toBe(true);
            let box = (await button.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        expect(await ctx.page.getByRole("button", { name: "Commands", exact: true }).count()).toBe(0);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await ctx.page.evaluate(() => document.documentElement.dir = "rtl");
        for (let name of ["Fetch remote bookmarks", "More repository actions"]) {
            let box = (await footer.getByRole("button", { name, exact: true }).boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        if (width === 320) {
            await ctx.page.evaluate(() => { document.documentElement.dir = "ltr"; document.documentElement.style.fontSize = "200%"; });
            expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            let enlarged = (await footer.boundingBox())!;
            expect(enlarged.y + enlarged.height).toBeLessThanOrEqual(900);
        }
    });

    it("opens secondary actions above the footer and restores focus from Commands", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 900 });
        await ctx.page.goto(url);
        let more = ctx.page.getByRole("button", { name: "More repository actions" });
        await more.focus();
        await more.press("ArrowUp");
        let menu = ctx.page.getByRole("menu", { name: "Repository actions" });
        await menu.waitFor();
        await expect.poll(async () => {
            let popup = (await menu.boundingBox())!;
            let footer = (await ctx.page.locator(".workspace-footer").boundingBox())!;
            return popup.y + popup.height <= footer.y + 4;
        }).toBe(true);
        expect(await menu.getByRole("menuitem", { name: "Refresh repository", exact: true }).count()).toBe(1);
        await menu.getByRole("menuitem", { name: "Commands…", exact: true }).click();
        let palette = ctx.page.getByRole("dialog", { name: "Commands", exact: true });
        await palette.waitFor();
        await ctx.page.keyboard.press("Escape");
        await expect.poll(() => more.evaluate(element => element === document.activeElement)).toBe(true);
    });
});
