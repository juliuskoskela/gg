import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("personal review progress", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("marks deliberately, survives reload and a description rewrite, and clears as a whole", async () => {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url);
        await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).waitFor();
        let select = async (description: string) => {
            await page.locator(".graph .selection-item").filter({ hasText: description }).first().click();
            await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).waitFor();
        };
        await select("change both");
        await page.getByRole("button", { name: "Mark file as reviewed", exact: true }).click();
        await page.getByRole("button", { name: "Unmark file as reviewed", exact: true }).waitFor();
        expect(await page.getByRole("img", { name: "Reviewed by you", exact: true }).count()).toBeGreaterThan(0);
        await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).click();
        await page.getByRole("button", { name: "Unmark change as reviewed", exact: true }).waitFor();
        await page.reload();
        await page.locator(".graph .selection-item").filter({ hasText: "change both" }).first().click();
        await page.getByRole("button", { name: "Unmark change as reviewed", exact: true }).waitFor();
        let repositories = join(ctx.dataDir, "repos");
        let reviewDir = readdirSync(repositories).map(name => join(repositories, name, "reviews")).find(path => existsSync(path))!;
        let events = readdirSync(reviewDir).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(join(reviewDir, name), "utf8")));
        expect(events.length).toBe(2);
        let whole = events.find(event => event.path === null);
        expect(typeof whole.person.email).toBe("string");
        expect(whole.files.length).toBeGreaterThan(0);
        execFileSync("jj", ["describe", "--ignore-immutable", "-R", ctx.tempDir, "-r", whole.change_id, "-m", "reviewed description rewritten"], { stdio: "pipe" });
        await page.reload();
        await page.locator(".graph .selection-item").filter({ hasText: "reviewed description rewritten" }).first().click();
        await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).waitFor();
        await page.getByRole("button", { name: "Unmark file as reviewed", exact: true }).waitFor();
        await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).click();
        await page.getByRole("button", { name: "Unmark change as reviewed", exact: true }).waitFor();
        mkdirSync("e2e/results/review-progress", { recursive: true });
        await page.screenshot({ path: "e2e/results/review-progress/reviewed-desktop.png" });
        await page.setViewportSize({ width: 390, height: 844 });
        let diffTab = page.getByRole("tab", { name: "Diff", exact: true });
        if (await diffTab.isVisible()) await diffTab.click();
        await page.getByRole("button", { name: "Unmark change as reviewed", exact: true }).waitFor();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: "e2e/results/review-progress/reviewed-mobile.png" });
        await page.getByRole("button", { name: "Unmark change as reviewed", exact: true }).click();
        await page.getByRole("button", { name: "Mark change as reviewed", exact: true }).waitFor();
        expect(existsSync(join(ctx.tempDir, "reviews"))).toBe(false);
    });
});
