import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("repository tree", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        // the Editor view follows the working copy, which is empty in the test repository; the snapshot at startup picks this file up as a change
        writeFileSync(join(ctx.tempDir, "scratch.txt"), "a change in the working copy\n");
    });
    afterEach(async () => { await destroyContext(ctx); });

    it("lists every file of the working copy, marks the changed ones, and ignores the timeline selection", async () => {
        await ctx.page.goto(await startGG(ctx));
        expect(await ctx.page.getByRole("tab", { name: "Editor", exact: true }).count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Editor", exact: true }).click();
        let tree = ctx.page.getByRole("tree", { name: "Repository files" });
        await tree.waitFor();
        let items = tree.getByRole("treeitem");
        await expect.poll(() => items.count()).toBeGreaterThan(0);
        let listing = () => items.evaluateAll(nodes => nodes.map(node => ({ path: node.getAttribute("aria-label"), changed: node.hasAttribute("data-changed"), level: node.getAttribute("aria-level") })));
        let all = await listing();
        let files = all.filter(item => item.path?.includes("."));
        expect(files.find(item => item.path === "scratch.txt")?.changed).toBe(true);
        expect(files.some(item => !item.changed)).toBe(true);
        expect(files.some(item => item.path === "a.txt" && !item.changed)).toBe(true);
        expect(all.every(item => item.level === "1" || item.path!.includes("/"))).toBe(true);

        // an older revision in the timeline leaves the working copy's tree as it was
        await ctx.page.locator(".graph .selection-item").nth(1).click();
        await expect.poll(() => ctx.page.locator(".graph .selection-item").nth(1).getAttribute("aria-selected")).toBe("true");
        await ctx.page.waitForTimeout(500);
        expect(await listing()).toEqual(all);

        let changedOnly = ctx.page.getByRole("button", { name: "Show changed files only", exact: true });
        expect(await changedOnly.getAttribute("aria-pressed")).toBe("false");
        await changedOnly.click();
        expect(await changedOnly.getAttribute("aria-pressed")).toBe("true");
        let shown = await items.evaluateAll(nodes => nodes.filter(node => node.getAttribute("aria-expanded") === null).map(node => ({ path: node.getAttribute("aria-label"), changed: node.hasAttribute("data-changed") })));
        expect(shown.map(item => item.path)).toEqual(["scratch.txt"]);
        expect(shown.every(item => item.changed)).toBe(true);
    });
});
