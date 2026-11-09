import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("diff line note markers", () => {
    let ctx: TestContext, url: string;
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        writeFileSync(join(ctx.tempDir, "marker.txt"), "first\nbefore\nlast\n");
        execFileSync("jj", ["describe", "-R", ctx.tempDir, "-m", "Marker base"], { stdio: "pipe" });
        execFileSync("jj", ["new", "-R", ctx.tempDir], { stdio: "pipe" });
        writeFileSync(join(ctx.tempDir, "marker.txt"), "first\nafter\nlast\n");
        url = await startGG(ctx);
        mkdirSync("e2e/results/diff-note-markers", { recursive: true });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("shows both sides, reuses hover previews and follows layout changes", async () => {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(url);
        await page.evaluate(() => {
            let group = (active: string) => ({ type: "tabs", active, panels: [active] });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "diff", root: { type: "split", direction: "row", ratio: .4, first: group("timeline"), second: { type: "split", direction: "column", ratio: .4, first: group("annotations"), second: group("diff") } } }));
        });
        await page.reload();
        await page.getByRole("button", { name: "Side by side", exact: true }).click();
        for (let [side, body] of [["addition", "Check the added line"], ["deletion", "Check the removed line"]]) {
            let line = page.locator(`.diff-content [data-line-type="change-${side}"][data-line]`).first();
            await line.click({ button: "right" });
            await page.getByRole("menuitem", { name: "Annotate line 2…", exact: true }).click();
            await page.getByRole("textbox", { name: "Note", exact: true }).fill(body);
            await page.getByRole("button", { name: "Save note", exact: true }).click();
        }
        let newMarker = page.getByRole("button", { name: "Open 1 note on new line 2", exact: true });
        let oldMarker = page.getByRole("button", { name: "Open 1 note on old line 2", exact: true });
        await newMarker.waitFor(); await oldMarker.waitFor();
        await newMarker.hover();
        await page.locator(".note-preview:popover-open").getByText("Check the added line", { exact: true }).waitFor();
        await newMarker.click();
        await expect.poll(() => page.locator(".note-preview:popover-open").count()).toBe(0);
        await page.getByRole("list", { name: "Notes", exact: true }).getByText("Check the added line", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Stacked", exact: true }).click();
        await newMarker.waitFor(); await oldMarker.waitFor();
        await page.getByRole("button", { name: "Wrap lines", exact: true }).click();
        await newMarker.waitFor(); await oldMarker.waitFor();
        await page.screenshot({ path: "e2e/results/diff-note-markers/desktop.png" });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForSelector(".workspace-dock.compact");
        await page.getByRole("tab", { name: "Diff", exact: true }).click();
        await newMarker.waitFor(); await oldMarker.waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: "e2e/results/diff-note-markers/mobile.png" });
    });
});
