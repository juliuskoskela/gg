import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, openChangedFiles, startGG, type TestContext } from "./harness.js";

describe("reviewed revision navigation", () => {
    let ctx: TestContext;
    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await mkdir(join(ctx.tempDir, "folder"));
        await writeFile(join(ctx.tempDir, "folder/a.txt"), "first added file\n");
        await writeFile(join(ctx.tempDir, "folder/b.txt"), "second added file\n");
        await ctx.page.setViewportSize({ width: 390, height: 844 });
    });
    afterEach(async () => destroyContext(ctx));

    it("opens revision tools and reaches a command by keyboard", async () => {
        let backend = await startGG(ctx);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        let views = ctx.page.getByRole("button", { name: "Views", exact: true });
        await views.focus();
        await views.press("Enter");
        await ctx.page.getByRole("menuitemcheckbox", { name: "Revision tools" }).click();
        let tab = ctx.page.getByRole("tab", { name: "Revision tools", exact: true });
        await expect.poll(() => tab.getAttribute("aria-selected")).toBe("true");
        let tool = ctx.page.locator(".revision-tools button:not(:disabled)").first();
        await tool.focus();
        expect(await tool.evaluate(element => element === document.activeElement)).toBe(true);
        let box = (await tool.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(844);
    });

    it("selects a hunk and discovers its commands using only keyboard activation", async () => {
        let backend = await startGG(ctx);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        let summary = ctx.page.locator(".hunk-actions summary");
        await summary.focus();
        await summary.press("Enter");
        await summary.press("Tab");
        let hunk = ctx.page.getByRole("listbox", { name: "File hunks" }).getByRole("option").first();
        expect(await hunk.evaluate(element => element === document.activeElement)).toBe(true);
        await hunk.press("Space");
        await expect.poll(() => hunk.getAttribute("aria-selected")).toBe("true");
        await ctx.page.keyboard.press("Control+k");
        let palette = ctx.page.getByRole("dialog", { name: "Commands" });
        await palette.getByRole("textbox", { name: "Commands" }).fill("Move hunk changes");
        expect(await palette.getByRole("button", { name: /Move hunk changes/ }).isEnabled()).toBe(true);
    });

    it("gives the nested file browser an owner and keyboard navigation", async () => {
        let backend = await startGG(ctx);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        let drawer = await openChangedFiles(ctx.page);
        let list = drawer.getByRole("tree", { name: "Changed files" });
        // folders carry no aria-selected, so this is the files alone
        let files = list.locator('[role="treeitem"][aria-selected]');
        await expect.poll(() => files.count()).toBe(2);
        let folder = list.getByRole("treeitem", { name: "folder", exact: true });
        expect(await folder.count()).toBe(1);
        expect(await folder.getAttribute("aria-expanded")).toBe("true");
        let rows = list.getByRole("treeitem");
        await rows.first().focus();
        await rows.first().press("End");
        expect(await rows.last().evaluate(element => element === document.activeElement)).toBe(true);
        await rows.last().press("Enter");
        await expect.poll(() => files.last().getAttribute("aria-selected")).toBe("true");
        expect(await files.last().getAttribute("aria-label")).toContain("b.txt");
    });
});
