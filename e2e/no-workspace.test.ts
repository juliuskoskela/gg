import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import {
    TestContext,
    createContext,
    destroyContext,
    startGG,
    extractTestRepo,
    writeUserConfig,
} from "./harness.js";

describe("`gg web` in a folder without a repository", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
    });

    afterEach(async () => {
        await destroyContext(ctx);
    });

    it("asks before initializing, and opens another folder from the start page instead", async () => {
        await ctx.page.goto(await startGG(ctx));

        let prompt = ctx.page.getByRole("region", { name: /^Initialize a repository in gg-test-/ });
        await prompt.waitFor({ timeout: 15000 });
        expect(await prompt.getByRole("checkbox", { name: /Colocate with Git/ }).isChecked()).toBe(true);
        // the harness isolates the jj user config, so the developer's own recent workspaces never show
        expect(await ctx.page.getByRole("list", { name: "Recent workspaces" }).count()).toBe(0);

        await prompt.getByRole("button", { name: "Choose another folder" }).click();
        let path = ctx.page.getByRole("textbox", { name: "Folder" });
        let open = ctx.page.getByRole("button", { name: "Open", exact: true });
        expect(await path.inputValue()).toBe(ctx.tempDir);
        await expect.poll(() => ctx.page.evaluate(() => document.activeElement?.id)).toBe("workspace-path");
        await path.fill("");
        expect(await open.isDisabled()).toBe(true);

        extractTestRepo(ctx.tempDir);
        await path.fill(ctx.tempDir);
        await path.press("Enter");
        await ctx.page.getByRole("button", { name: "Timeline", exact: true }).waitFor();
        await expect.poll(() => ctx.page.locator(".graph").isVisible(), { timeout: 10000 }).toBe(true);
    });

    it("initializes a plain folder colocated with Git and opens it", async () => {
        await writeFile(join(ctx.tempDir, "notes.txt"), "hello\n");
        await ctx.page.goto(await startGG(ctx));

        let prompt = ctx.page.getByRole("region", { name: /^Initialize a repository in gg-test-/ });
        await prompt.waitFor({ timeout: 15000 });
        expect(await prompt.innerText()).toContain("Git tools keep working in this folder.");
        let colocate = prompt.getByRole("checkbox", { name: /Colocate with Git/ });
        expect(await colocate.isChecked()).toBe(true);
        expect(await colocate.isDisabled()).toBe(false);

        await prompt.getByRole("button", { name: "Initialize repository" }).click();
        await ctx.page.getByRole("button", { name: "Timeline", exact: true }).waitFor({ timeout: 15000 });
        await expect.poll(() => ctx.page.locator(".graph").isVisible(), { timeout: 10000 }).toBe(true);
        await access(join(ctx.tempDir, ".jj"));
        await access(join(ctx.tempDir, ".git"));
    });

    it("explains a missing path or a file without offering to initialize", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Choose another folder" }).click();
        let path = ctx.page.getByRole("textbox", { name: "Folder" });

        let missing = join(ctx.tempDir, "missing");
        await path.fill(missing);
        await path.press("Enter");
        await expect.poll(() => ctx.page.getByRole("alert").textContent()).toContain(`There is no folder at ${missing}`);
        expect(await ctx.page.getByRole("button", { name: "Initialize repository" }).count()).toBe(0);
        expect(await path.inputValue()).toBe(missing);

        let file = join(ctx.tempDir, "notes.txt");
        await writeFile(file, "not a folder\n");
        await path.fill(file);
        await path.press("Enter");
        await expect.poll(() => ctx.page.getByRole("alert").textContent()).toContain(`${file} is a file`);
        expect(await ctx.page.getByRole("button", { name: "Initialize repository" }).count()).toBe(0);
    });

    it("says when a recent workspace's folder is gone", async () => {
        let repo = join(ctx.tempDir, "kept");
        let gone = join(ctx.tempDir, "gone");
        await mkdir(repo);
        extractTestRepo(repo);
        await mkdir(gone);
        await writeUserConfig(ctx, [gone, repo]);
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Choose another folder" }).click();

        let recent = ctx.page.getByRole("list", { name: "Recent workspaces" });
        await recent.waitFor();
        let rows = recent.getByRole("button");
        expect(await rows.count()).toBe(2);
        expect(await rows.first().getAttribute("aria-label")).toBe(`gone, ${gone}`);
        expect(await rows.first().getAttribute("title")).toBe(gone);

        // arrows move focus without opening anything
        await rows.first().focus();
        await ctx.page.keyboard.press("ArrowDown");
        expect(await rows.nth(1).evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("ArrowUp");

        await rm(gone, { recursive: true });
        await ctx.page.keyboard.press("Enter");
        await expect.poll(() => ctx.page.getByRole("alert").textContent()).toContain(`${gone} no longer exists`);

        await recent.getByRole("button", { name: `kept, ${repo}` }).click();
        await ctx.page.getByRole("button", { name: "Timeline", exact: true }).waitFor();
    });
});
