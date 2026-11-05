import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RepoStatus } from "../app/messages/RepoStatus";
import type { MutationResult } from "../app/messages/MutationResult";

describe("whole-file diff context", () => {
    let ctx: TestContext;
    let url: string;
    let commit: string;
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        expect(response.ok).toBe(true);
        return response.json();
    }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        let original = Array.from({ length: 80 }, (_, i) => `context-line-${String(i).padStart(3, "0")}\n`).join("");
        await writeFile(join(ctx.tempDir, "context.txt"), original);
        url = await startGG(ctx);
        let workspace = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (workspace.type !== "Workspace") throw Error("No fixture workspace");
        let status = await request<RepoStatus | null>("query/query_snapshot") ?? workspace.status;
        let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: status.working_copy };
        let result = await request<MutationResult>("mutate/create_revision", { mutation: { set: { from: id, to: id } }, options: { ignore_immutable: false } });
        expect(result.type).toBe("Updated");
        await writeFile(join(ctx.tempDir, "context.txt"), original.replace("context-line-020", "changed-line-020").replace("context-line-060", "changed-line-060"));
        let next = await request<RepoStatus | null>("query/query_snapshot");
        if (!next) throw Error("Missing changed fixture status");
        commit = next.working_copy.hex;
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    function text() { return ctx.page.locator(".diff-viewer").evaluate(node => node.querySelector("diffs-container")?.shadowRoot?.textContent ?? ""); }
    it("toggles whole context on desktop and phone without changing hunk-action boundaries", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=${commit}&file=context.txt`);
        await expect.poll(text).toContain("changed-line-020");
        expect(await text()).not.toContain("context-line-000");
        await expect.poll(() => ctx.page.locator(".hunk-actions summary").textContent()).toContain("2");
        let toggle = ctx.page.getByRole("button", { name: "Show whole file", exact: true });
        await toggle.click();
        await expect.poll(text).toContain("context-line-000");
        expect(await text()).toContain("context-line-079");
        expect(await text()).toContain("changed-line-060");
        expect(await ctx.page.locator(".hunk-actions summary").textContent()).toContain("2");
        expect(await toggle.getAttribute("aria-pressed")).toBe("true");
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.getByLabel("Diff display options", { exact: true }).click();
        let checkbox = ctx.page.getByRole("checkbox", { name: "Show whole file", exact: true });
        expect(await checkbox.isChecked()).toBe(true);
        await checkbox.uncheck();
        await expect.poll(text).not.toContain("context-line-000");
        await checkbox.check();
        await expect.poll(text).toContain("context-line-079");
        expect(await ctx.page.getByText(/Couldn’t render this diff/).count()).toBe(0);
    });
});
