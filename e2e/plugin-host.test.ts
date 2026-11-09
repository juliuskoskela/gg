import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { PluginOperation } from "../app/messages/PluginOperation";
import type { PluginData } from "../app/messages/PluginData";

describe("bundled plugin local transport", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
        await fetch(`${url}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir }) });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    async function data(operation: PluginOperation, workspace = ctx.tempDir) {
        return fetch(`${url}/api/annotate/plugin_data`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { plugin: "review", workspace, operation } }) });
    }
    it("persists plugin data across sessions and rejects the wrong workspace without losing the worker", async () => {
        expect((await data({ type: "Set", key: "session", value: { reviewed: "abc" } })).ok).toBe(true);
        expect((await data({ type: "Set", key: "large", value: "x".repeat(3 * 1024 * 1024) })).ok).toBe(true);
        expect((await data({ type: "Delete", key: "large" })).ok).toBe(true);
        let fact = await (await data({ type: "Publish", kind: "review-complete", data: { change: "abc" } })).json() as PluginData;
        expect(fact.facts[0].plugin).toBe("review");
        expect((await data({ type: "Set", key: "session", value: false }, "/not-the-active-workspace")).ok).toBe(false);
        let unchanged = await (await data({ type: "Get", key: "session" })).json() as PluginData;
        expect(unchanged.value).toEqual({ reviewed: "abc" });
        ctx.ggProcess!.kill();
        url = await startGG(ctx);
        await fetch(`${url}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir }) });
        let stored = await (await data({ type: "Get", key: "session" })).json() as PluginData;
        expect(stored.value).toEqual({ reviewed: "abc" });
        let facts = await (await data({ type: "Facts", after: null })).json() as PluginData;
        expect(facts.facts[0].id).toBe(fact.facts[0].id);
        await ctx.page.goto(url);
        await ctx.page.getByRole("button", { name: "Settings", exact: true }).click();
        await ctx.page.getByRole("heading", { name: "Bundled plugins" }).scrollIntoViewIfNeeded();
        await expect.poll(() => ctx.page.getByRole("checkbox", { name: "Review", exact: true }).isVisible()).toBe(true);
        expect(await ctx.page.getByRole("checkbox", { name: "Review", exact: true }).isChecked()).toBe(false);
        await ctx.page.getByText("Permissions", { exact: true }).click();
        await expect.poll(() => ctx.page.getByText("Read review progress", { exact: true }).isVisible()).toBe(true);
        await mkdir("e2e/results", { recursive: true });
        await ctx.page.screenshot({ path: "e2e/results/plugin-settings.png" });
    });
});
