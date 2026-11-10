import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("opening views from right-click", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("offers closed views in empty space and after object actions, opening them beside the clicked view", async () => {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url);
        await page.evaluate(() => {
            let group = (active: string) => ({ type: "tabs", active, panels: [active] });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "timeline", root: { type: "split", direction: "row", ratio: .45, first: group("timeline"), second: group("description") } }));
        });
        await page.reload();
        let description = page.locator(".description-panel");
        await description.waitFor();
        let box = (await description.boundingBox())!;
        await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, { button: "right" });
        let menu = page.getByRole("menu");
        expect(await menu.getByRole("menuitem").allTextContents()).toContain("Open Diff");
        expect(await menu.getByRole("menuitem", { name: "Open Timeline" }).count()).toBe(0);
        await menu.getByRole("menuitem", { name: "Open Diff" }).click();
        await expect.poll(() => page.getByRole("tablist", { name: "Panels" }).getByRole("tab").allTextContents()).toEqual(["Diff0", "Description"]);

        await page.locator(".graph .selection-item").nth(1).click({ button: "right" });
        let items = await page.getByRole("menu").getByRole("menuitem").allTextContents();
        // views follow the actions; destructive actions stay last
        expect(items.indexOf("Open Editor")).toBeGreaterThan(items.indexOf("New child"));
        expect(items.at(-1)).toBe("Abandon");
    });
});
