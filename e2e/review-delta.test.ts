import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RevsResult } from "../app/messages/RevsResult";
import type { RevId } from "../app/messages/RevId";
import type { ReviewDelta } from "../app/messages/ReviewDelta";

describe("version comparison", () => {
    let ctx: TestContext, url: string, from: RevId, to: RevId;
    let errors: string[] = [];
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${endpoint}: ${await response.text()}`);
        return response.json();
    }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        await writeFile(join(ctx.tempDir, "comparison.ts"), "let answer = 1;\n");
        url = await startGG(ctx);
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw new Error("Missing workspace");
        let selected = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: config.status.working_copy };
        async function current() {
            let value = await request<RevsResult>("query/query_revisions", { set: { from: selected, to: selected } });
            if (value.type !== "Detail") throw new Error("Missing version");
            return value.headers[0].id;
        }
        await request("mutate/describe_revision", { mutation: { id: await current(), new_description: "Before review edits", reset_author: false }, options: { ignore_immutable: false } });
        from = await current();
        await writeFile(join(ctx.tempDir, "comparison.ts"), "let answer = 2;\n");
        await request("query/query_snapshot");
        await request("mutate/describe_revision", { mutation: { id: await current(), new_description: "After review edits", reset_author: false }, options: { ignore_immutable: false } });
        to = await current();
        ctx.page.on("pageerror", error => errors.push(error.message));
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it.each([1440, 390])("compares exact versions from Evolution at %ipx", async width => {
        let delta = await request<ReviewDelta>("query/query_review_delta", { request: { from, to, path: "comparison.ts", full_context: false } });
        expect(delta.type).toBe("Ready");
        if (delta.type !== "Ready") return;
        expect(delta.changes.map(change => change.path.repo_path)).toEqual(["comparison.ts"]);
        expect(delta.description_before).toBe("Before review edits");
        await ctx.page.setViewportSize({ width, height: 900 });
        await ctx.page.goto(`${url}/?inspect=${to.commit.hex}`);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "evolution", panels: ["evolution"] }, compactActive: "evolution" })));
        await ctx.page.reload();
        await ctx.page.getByRole("button", { name: "Compare versions", exact: true }).click();
        await ctx.page.getByRole("combobox", { name: "Compare from version" }).selectOption(from.commit.hex);
        let comparison = ctx.page.getByRole("region", { name: "Changes between versions", exact: true });
        await comparison.getByRole("combobox", { name: "Comparison file" }).waitFor();
        await expect.poll(() => comparison.locator("diffs-container").evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent ?? "").join(""))).toContain("answer = 2");
        expect(await comparison.getByText("Description changed", { exact: true }).count()).toBe(1);
        expect(errors).toEqual([]);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    it("opens the exact stored file review without exposing hunk mutations", async () => {
        await request("annotate/review_progress", { request: { type: "Set", id: to, path: "comparison.ts", reviewed: true } });
        await writeFile(join(ctx.tempDir, "comparison.ts"), "let answer = 3;\n");
        await request("query/query_snapshot");
        let currentId = { ...to, commit: { ...to.commit, hex: "" } };
        let selected = await request<RevsResult>("query/query_revisions", { set: { from: currentId, to: currentId } });
        if (selected.type !== "Detail") throw new Error("Missing rewritten version");
        let current = selected.headers[0].id;
        await ctx.page.addInitScript(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "diff", panels: ["diff"] }, compactActive: "diff" })));
        await ctx.page.goto(`${url}/?inspect=${current.commit.hex}&file=comparison.ts`);
        await ctx.page.locator(".diff-footer").getByRole("button", { name: "Since review", exact: true }).click();
        let comparison = ctx.page.getByRole("region", { name: "Changes since review", exact: true });
        await expect.poll(() => comparison.locator("diffs-container").evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent ?? "").join(""))).toContain("answer = 3");
        expect(await comparison.textContent()).toContain(to.commit.hex.slice(0, 8));
        expect(await ctx.page.locator(".hunk-actions").count()).toBe(0);
        await mkdir("e2e/results/review-delta", { recursive: true });
        await ctx.page.screenshot({ path: "e2e/results/review-delta/since-review-mobile.png" });
        await ctx.page.getByRole("button", { name: "Back to file diff", exact: true }).click();
        await ctx.page.locator(".hunk-actions").waitFor();
        to = current;
        expect(errors).toEqual([]);
    });

    it("opens a whole-change description comparison from the hosted toolbar", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 900 });
        await request("annotate/review_progress", { request: { type: "Set", id: to, path: null, reviewed: true } });
        await request("mutate/describe_revision", { mutation: { id: to, new_description: "Explain the reviewed implementation", reset_author: false }, options: { ignore_immutable: false } });
        let id = { ...to, commit: { ...to.commit, hex: "" } };
        let result = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
        if (result.type !== "Detail") throw new Error("Missing description rewrite");
        await ctx.page.addInitScript(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "diff", panels: ["diff"] }, compactActive: "diff" })));
        await ctx.page.goto(`${url}/?inspect=${result.headers[0].id.commit.hex}`);
        await ctx.page.locator(".diff-tools").getByRole("button", { name: "Since review", exact: true }).click();
        let comparison = ctx.page.getByRole("region", { name: "Changes since review", exact: true });
        await comparison.getByText("Description changed", { exact: true }).waitFor();
        await comparison.getByText("No code changes between these versions.", { exact: true }).waitFor();
        expect(errors).toEqual([]);
    });

});
