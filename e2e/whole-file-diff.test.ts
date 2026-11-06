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
        let toggle = ctx.page.getByRole("button", { name: "Hide unmodified lines", exact: true });
        let heading = ctx.page.locator(".panel-view-top").filter({ has: ctx.page.locator("#panel-tab-diff") });
        let controls = heading.locator(".display-options");
        async function expectHeaderControls() {
            let bounds = (await heading.boundingBox())!;
            let tools = (await controls.boundingBox())!;
            let count = (await heading.locator(".file-count").boundingBox())!;
            let totals = (await heading.locator(".diff-stat").boundingBox())!;
            expect(tools.x).toBeGreaterThanOrEqual(bounds.x);
            expect(tools.x + tools.width).toBeLessThanOrEqual(bounds.x + bounds.width);
            let close = (await heading.getByRole("button", { name: "Close Diff", exact: true }).boundingBox())!;
            if (tools.y < close.y + close.height && tools.y + tools.height > close.y) expect(tools.x + tools.width).toBeLessThanOrEqual(close.x);
            expect(tools.x + tools.width).toBeLessThanOrEqual(bounds.x + bounds.width);
            expect(tools.y).toBeGreaterThanOrEqual(bounds.y);
            expect(tools.y + tools.height).toBeLessThanOrEqual(bounds.y + bounds.height);
            expect(totals.x).toBeGreaterThanOrEqual(count.x + count.width);
            expect(await controls.getByRole("button").count()).toBe(5);
            expect(await ctx.page.locator(".changes-module .display-options").count()).toBe(0);
            expect(await heading.locator(".file-count").textContent()).toContain("file");
        }
        await expectHeaderControls();
        let timelineHeader = ctx.page.locator(".panel-view-top").filter({ has: ctx.page.locator("#panel-tab-timeline") });
        expect(await heading.getByRole("tab").count()).toBe(0);
        expect(await timelineHeader.getByRole("tab").count()).toBe(0);
        expect(await timelineHeader.getByRole("button", { name: "Tall revisions", exact: true }).count()).toBe(1);
        let timelineFooter = (await ctx.page.locator(".timeline-footer").boundingBox())!;
        let diffFooter = (await ctx.page.locator(".diff-footer").boundingBox())!;
        expect(diffFooter.height).toBe(timelineFooter.height);
        expect(diffFooter.y).toBe(timelineFooter.y);
        expect(await ctx.page.locator(".diff-footer").getByRole("button", { name: "Next changed file" }).count()).toBe(1);
        expect(await toggle.getAttribute("aria-pressed")).toBe("true");
        await toggle.click();
        await expect.poll(text).toContain("context-line-000");
        expect(await text()).toContain("context-line-079");
        expect(await text()).toContain("changed-line-060");
        expect(await ctx.page.locator(".hunk-actions summary").textContent()).toContain("2");
        expect(await toggle.getAttribute("aria-pressed")).toBe("false");
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        await expectHeaderControls();
        expect(await toggle.getAttribute("aria-pressed")).toBe("false");
        await toggle.click();
        await expect.poll(text).not.toContain("context-line-000");
        await toggle.click();
        await expect.poll(text).toContain("context-line-079");
        await ctx.page.setViewportSize({ width: 320, height: 844 });
        await expectHeaderControls();
        let position = (await controls.boundingBox())!;
        let footerPosition = (await ctx.page.locator(".diff-footer").boundingBox())!;
        await ctx.page.locator(".diff-scroll").evaluate(element => element.scrollTop = element.scrollHeight);
        expect((await controls.boundingBox())!.y).toBe(position.y);
        expect((await ctx.page.locator(".diff-footer").boundingBox())!.y).toBe(footerPosition.y);
        expect(await ctx.page.getByText(/Couldn’t render this diff/).count()).toBe(0);
        await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).click();
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        await expectHeaderControls();
    });
});
