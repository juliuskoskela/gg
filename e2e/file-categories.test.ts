import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RepoStatus } from "../app/messages/RepoStatus";

describe("review file categories", () => {
    let ctx: TestContext;
    let url: string;
    let commit: string;
    beforeAll(async () => {
        await mkdir("e2e/results", { recursive: true });
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await mkdir(join(ctx.tempDir, "spec"));
        await writeFile(join(ctx.tempDir, ".gitattributes"), "spec/** review-test\n.gitattributes review-agent-guidance\n");
        await writeFile(join(ctx.tempDir, "spec/check.rs"), "test one\ntest two\n");
        await writeFile(join(ctx.tempDir, "implementation.rs"), "implementation\n");
        url = await startGG(ctx);
        let config = await fetch(`${url}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir }) }).then(response => response.json()) as RepoConfig;
        if (config.type !== "Workspace") throw Error("missing fixture workspace");
        let status = await fetch(`${url}/api/query/query_snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(response => response.json()) as RepoStatus | null;
        commit = (status ?? config.status).working_copy.hex;
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("keeps categorized files selectable and shows exact implementation and full totals", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=${commit}&file=implementation.rs`);
        let counts = ctx.page.locator('.panel-view-top .diff-stat[aria-label="Implementation: 1 additions, 0 deletions. All files: 5 additions, 0 deletions"]');
        await expect.poll(() => counts.count()).toBe(1);
        await ctx.page.getByRole("button", { name: "Group by type", exact: true }).click();
        await ctx.page.getByRole("heading", { name: "Tests 1" }).waitFor();
        await ctx.page.getByRole("option", { name: "spec/check.rs", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".diff-viewer").evaluate(node => node.querySelector("diffs-container")?.shadowRoot?.textContent ?? "")).toContain("test one");
        await expect.poll(() => ctx.page.locator(".graph .diff-stat").filter({ hasText: "+1" }).count()).toBeGreaterThan(0);
        await ctx.page.screenshot({ path: "e2e/results/file-categories.png" });
    });
});
