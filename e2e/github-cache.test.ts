import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";
import { mkdirSync } from "node:fs";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("opt-in public GitHub cache", () => {
    let ctx: TestContext, url: string;
    let previousConfig = process.env.XDG_CONFIG_HOME;
    beforeAll(async () => { ctx = await createContext(); process.env.XDG_CONFIG_HOME = `${ctx.dataDir}/config`; extractTestRepo(ctx.tempDir); url = await startGG(ctx); });
    afterAll(async () => { if (ctx) await destroyContext(ctx); if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig; });
    it("keeps network off until consent, maps exact heads, and opens cached data offline", async () => {
        let page = ctx.page, requests = 0;
        onTestFailed(async () => { mkdirSync("e2e/results/github-cache", { recursive: true }); await page.screenshot({ path: "e2e/results/github-cache/failure.png" }); console.log(await page.locator("body").innerText()); });
        // this malformed request is rejected before the broker can contact GitHub.
        let bad = await page.request.post(`${url}/api/query/github_public`, { data: { request: { owner: "../escape", repo: "repo", endpoint: { type: "List", page: 1 }, etag: null } } });
        expect(bad.status()).toBe(500); expect(await bad.text()).toContain("Invalid GitHub repository name");
        let sha = "";
        page.on("response", async response => {
            if (response.url().endsWith("/api/query/query_revision_summary")) {
                let result = await response.json().catch(() => null);
                let header = result?.headers?.find((header: any) => header.description.lines.join("\n").trim() === "change both");
                if (header) sha = header.id.commit.hex;
            }
        });
        await page.route("**/api/query/github_public", async route => {
            requests++;
            await route.fulfill({ json: { status: 200, etag: '"fixture"', retry_after_seconds: null, reset_at_seconds: null, remaining: 50, has_next: false, pulls: [{ number: 7, repository_id: "123", title: "A public feature", author: "author", state: "open", draft: false, merged: false, head_sha: sha, base_sha: "b".repeat(40), head_ref: "topic", requested_reviewers: ["reviewer"], updated_at: "2026-11-10T00:00:00Z" }] } });
        });
        await page.goto(url);
        await page.locator(".graph .selection-item").filter({ hasText: "change both" }).first().waitFor();
        await page.locator(".graph .selection-item").filter({ hasText: "change both" }).first().click();
        await expect.poll(() => sha).toMatch(/^[a-f0-9]{40}$/);
        await page.evaluate(() => { let group = (active: string, panels = [active]) => ({ type: "tabs", active, panels }); localStorage.setItem("gg.plugins.enabled", '["github"]'); localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "plugin:github:pulls", root: { type: "split", direction: "row", ratio: .4, first: group("timeline"), second: group("plugin:github:pulls", ["diff", "plugin:github:pulls"]) } })); });
        await page.reload(); await page.getByLabel("Owner", { exact: true }).waitFor(); expect(requests).toBe(0);
        await page.getByLabel("Owner", { exact: true }).fill("example"); await page.getByLabel("Repository", { exact: true }).fill("project"); await page.getByLabel("Reviewer login (optional)", { exact: true }).fill("reviewer");
        await page.getByRole("button", { name: "Save settings", exact: true }).click(); expect(requests).toBe(0);
        await page.getByRole("button", { name: "Settings", exact: true }).last().click(); await page.getByLabel("Allow public reads from api.github.com every 15 minutes", { exact: true }).check(); await page.getByRole("button", { name: "Save settings", exact: true }).click();
        await page.locator("button[data-log-row]").filter({ hasText: "#7 A public feature" }).click(); expect(requests).toBe(1);
        await page.locator(".graph .selection-item").filter({ hasText: "change both" }).first().click();
        await page.getByRole("button", { name: "Map selected local changes", exact: true }).click(); await page.getByText("Exact cached head matched the selected local versions.", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Settings", exact: true }).last().click(); await page.getByLabel("Allow public reads from api.github.com every 15 minutes", { exact: true }).uncheck(); await page.getByRole("button", { name: "Save settings", exact: true }).click();
        await page.reload(); await page.locator("button[data-log-row]").filter({ hasText: "#7 A public feature" }).click(); await page.getByText("Exact cached head matched the selected local versions.", { exact: true }).waitFor(); expect(requests).toBe(1);
        mkdirSync("e2e/results/github-cache", { recursive: true }); await page.screenshot({ path: "e2e/results/github-cache/desktop.png" });
        await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("tab", { name: "Public GitHub", exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: "e2e/results/github-cache/mobile.png" });
    });
});
