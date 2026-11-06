import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    TestContext,
    createContext,
    destroyContext,
    startGG,
    extractTestRepo,
} from "./harness.js";

describe("`gg web` in an empty directory", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
    });

    afterEach(async () => {
        await destroyContext(ctx);
    });

    it("opens a workspace from the recovery dialog", async () => {
        let serverUrl = startGG(ctx);

        await ctx.page.goto(await serverUrl);

        // wait for the error dialog to appear
        await expect(async () => {
            let element = ctx.page.locator("text=No workspace loaded");
            await element.waitFor({ timeout: 15000 });
        }).not.toThrow();

        let path = ctx.page.getByRole("textbox", { name: "Repository path" });
        let open = ctx.page.getByRole("button", { name: "Open workspace", exact: true });
        expect(await open.isDisabled()).toBe(true);
        extractTestRepo(ctx.tempDir);
        await path.fill(ctx.tempDir);
        await open.click();
        await ctx.page.getByRole("button", { name: "Timeline", exact: true }).waitFor();
        await expect.poll(() => ctx.page.locator(".graph").isVisible(), { timeout: 10000 }).toBe(true);
    });
});
