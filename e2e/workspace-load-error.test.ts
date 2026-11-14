import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, startGG, type TestContext } from "./harness";

describe("opening a Git-only checkout", () => {
    let ctx: TestContext, url: string;
    let git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: ctx.tempDir, stdio: "pipe" });
    beforeAll(async () => {
        ctx = await createContext();
        git("init", "--quiet");
        await mkdir(join(ctx.tempDir, "docs"));
        execFileSync("sh", ["-c", "echo hello > docs/readme.txt"], { cwd: ctx.tempDir });
        git("add", ".");
        git("commit", "--quiet", "-m", "Add the readme from Git");
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("offers to set up Jujutsu that keeps the Git history, then opens it", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 900 });
        await ctx.page.goto(url);
        let prompt = ctx.page.getByRole("region", { name: /^Set up Jujutsu in gg-test-/ });
        await prompt.waitFor({ timeout: 15000 });
        let text = await prompt.innerText();
        expect(text).toContain("keeps its Git history");
        expect(text).toContain("Git and jj stay in sync");
        let colocate = prompt.getByRole("checkbox", { name: /Colocate with Git/ });
        expect(await colocate.isChecked()).toBe(true);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(access(join(ctx.tempDir, ".jj"))).rejects.toThrow();

        await prompt.getByRole("button", { name: "Initialize repository" }).click();
        // the phone layout shows the timeline as a tab; the commit from Git is in it either way
        await expect.poll(() => ctx.page.locator("#shell").innerText(), { timeout: 15000 }).toContain("Add the readme from Git");
        await access(join(ctx.tempDir, ".jj"));
    });
});
