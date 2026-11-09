import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, startGG, type TestContext } from "./harness";

describe("opening a Git-only checkout", () => {
    let ctx: TestContext, url: string;
    beforeAll(async () => {
        ctx = await createContext();
        execFileSync("git", ["init", "--quiet", ctx.tempDir]);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("explains missing Jujutsu metadata, preserves the folder and handles another selected path", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 900 });
        await ctx.page.goto(url);
        let dialog = ctx.page.getByRole("dialog", { name: "Jujutsu setup needed" });
        await dialog.waitFor();
        expect(await dialog.innerText()).toContain("Git repository without a Jujutsu workspace");
        expect(await dialog.getByLabel("Repository path").inputValue()).toBe(ctx.tempDir);
        expect(await dialog.innerText()).toContain("jj git init --colocate");
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(access(join(ctx.tempDir, ".jj"))).rejects.toThrow();
        await mkdir("e2e/results/workspace-load-error", { recursive: true });
        await ctx.page.screenshot({ path: "e2e/results/workspace-load-error/phone.png", fullPage: true });
        let other = join(ctx.tempDir, "another checkout");
        await mkdir(other);
        execFileSync("git", ["init", "--quiet", other]);
        await dialog.getByLabel("Repository path").fill(other);
        await dialog.getByRole("button", { name: "Open workspace", exact: true }).click();
        await expect.poll(() => dialog.locator("code").first().textContent()).toBe(other);
        await expect(access(join(other, ".jj"))).rejects.toThrow();
        await ctx.page.setViewportSize({ width: 1440, height: 1000 });
        await ctx.page.screenshot({ path: "e2e/results/workspace-load-error/desktop.png", fullPage: true });
    });
});
