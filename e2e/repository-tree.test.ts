import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("repository tree", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
    });
    afterEach(async () => { await destroyContext(ctx); });

    it("lists every file of the selected revision and marks the changed ones", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.locator(".graph .selection-item").nth(1).click();
        expect(await ctx.page.getByRole("tab", { name: "Files", exact: true }).count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Files", exact: true }).click();
        let tree = ctx.page.getByRole("tree", { name: "Repository files" });
        await tree.waitFor();
        let items = tree.getByRole("treeitem");
        await expect.poll(() => items.count()).toBeGreaterThan(0);
        let all = await items.evaluateAll(nodes => nodes.map(node => ({ path: node.getAttribute("aria-label"), changed: node.hasAttribute("data-changed"), level: node.getAttribute("aria-level") })));
        let files = all.filter(item => item.path?.includes("."));
        expect(files.some(item => item.changed)).toBe(true);
        expect(files.some(item => !item.changed)).toBe(true);
        expect(all.every(item => item.level === "1" || item.path!.includes("/"))).toBe(true);
        await ctx.page.getByRole("button", { name: "Changed only", exact: true }).click();
        let changedOnly = await items.evaluateAll(nodes => nodes.filter(node => node.getAttribute("aria-expanded") === null).map(node => node.hasAttribute("data-changed")));
        expect(changedOnly.length).toBeGreaterThan(0);
        expect(changedOnly.every(Boolean)).toBe(true);
    });
});
