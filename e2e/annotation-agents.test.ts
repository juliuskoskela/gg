import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, PROJECT_ROOT, startGG, type TestContext } from "./harness";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RevsResult } from "../app/messages/RevsResult";
import type { RevId } from "../app/messages/RevId";
import type { AnnotationList } from "../app/messages/AnnotationList";

let binary = join(PROJECT_ROOT, "target", "debug", process.platform === "win32" ? "gg.exe" : "gg");
describe("local annotation agent loop", () => {
    let ctx: TestContext, url: string, source: RevId, note: string;
    let errors: string[] = [];
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${endpoint}: ${await response.text()}`);
        return response.json();
    }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        await writeFile(join(ctx.tempDir, "agent-loop.ts"), "let answer = 1;\n");
        url = await startGG(ctx);
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw new Error("Missing workspace");
        let alias = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: config.status.working_copy };
        let revisions = await request<RevsResult>("query/query_revisions", { set: { from: alias, to: alias } });
        if (revisions.type !== "Detail") throw new Error("Missing revision");
        source = revisions.headers[0].id;
        await request("annotate/review_progress", { request: { type: "Set", id: source, path: "agent-loop.ts", reviewed: true } });
        let list = await request<AnnotationList>("annotate/annotations", { request: { type: "Create", targets: [{ anchor: { kind: "lines", change_id: source.change.hex, commit_id: source.commit.hex, path: "agent-loop.ts", side: "new", start: 1, end: 1, quote: "let answer = 1;" }, subject: "Change the answer" }], body: "Please update this answer." } });
        note = list.threads[0].id;
        await ctx.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        ctx.page.on("pageerror", error => errors.push(error.message));
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("copies context locally, reads a CLI agent reply, and compares the existing review baseline", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=${source.commit.hex}`);
        await ctx.page.evaluate(() => {
            let group = (active: string, panels = [active]) => ({ type: "tabs", active, panels });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "annotations", root: { type: "split", direction: "row", ratio: .35, first: group("timeline"), second: group("annotations", ["annotations", "diff"]) } }));
        });
        await ctx.page.reload();
        await ctx.page.getByRole("list", { name: "Notes" }).getByRole("button", { name: /Please update this answer/ }).click();
        await ctx.page.getByRole("button", { name: "Copy for agent", exact: true }).click();
        await ctx.page.getByText("Copied for agent", { exact: true }).waitFor();
        let copied = await ctx.page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain(source.commit.hex); expect(copied).toContain(source.change.hex); expect(copied).toContain(note); expect(copied).toContain("let answer = 1;"); expect(copied).toContain("gg annotations reply");

        execFileSync(binary, ["annotations", "-R", ctx.tempDir, "reply", note, "--agent", "codex", "--model", "gpt-test", "--risk-level", "3", "--risk-explanation", "Changes the parser", "Updated the answer."], { env: { ...process.env, GG_DATA_DIR: ctx.dataDir }, encoding: "utf8" });
        await writeFile(join(ctx.tempDir, "agent-loop.ts"), "let answer = 2;\n");
        await request("query/query_snapshot");
        await ctx.page.getByText("Updated the answer.", { exact: true }).waitFor();
        await ctx.page.getByText("Agent replied", { exact: true }).first().waitFor();
        await ctx.page.getByText("Change rewritten", { exact: true }).first().waitFor();
        await ctx.page.getByText("gpt-test", { exact: true }).waitFor();
        await ctx.page.getByLabel("Agent-reported high risk", { exact: true }).waitFor();
        let list = await request<AnnotationList>("annotate/annotations", { request: { type: "List" } });
        expect(list.threads[0].posts[1].metadata).toEqual({ onBehalfOf: { agent: "codex", model: "gpt-test" }, riskScore: { level: 3, explanations: ["Changes the parser"] } });
        expect(list.threads[0].targets[0].anchor.commit_id).toBe(source.commit.hex);
        await ctx.page.getByRole("button", { name: "Copy for agent", exact: true }).click();
        await expect.poll(() => ctx.page.evaluate(() => navigator.clipboard.readText())).toContain('"plugin":"onBehalfOf"');
        let replyPacket = await ctx.page.evaluate(() => navigator.clipboard.readText());
        expect(replyPacket).toContain('"plugin":"riskScore"');
        expect(replyPacket).toContain('"model":"gpt-test"');
        await mkdir("e2e/results/annotation-agents", { recursive: true });
        await ctx.page.screenshot({ path: "e2e/results/annotation-agents/replied-desktop.png", fullPage: true });
        await ctx.page.setViewportSize({ width: 390, height: 900 });
        await ctx.page.screenshot({ path: "e2e/results/annotation-agents/replied-mobile.png", fullPage: true });
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await ctx.page.getByRole("button", { name: "Review changes", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Since review", exact: true }).last().click();
        let comparison = ctx.page.getByRole("region", { name: "Changes since review", exact: true });
        await expect.poll(() => comparison.locator("diffs-container").evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent ?? "").join(""))).toContain("answer = 2");
        expect(await comparison.locator("diffs-container").evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent ?? "").join(""))).toContain("answer = 1");
        expect(errors).toEqual([]);
    });
});
