import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { RevisionSummaryResult } from "../app/messages/RevisionSummaryResult";
import type { ReviewProgress } from "../app/messages/ReviewProgress";
import type { AnnotationList } from "../app/messages/AnnotationList";
import type { RevId } from "../app/messages/RevId";
import type { MutationResult } from "../app/messages/MutationResult";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RepoStatus } from "../app/messages/RepoStatus";

describe("range review", () => {
    let ctx: TestContext, url: string, first: RevId, last: RevId;
    let status: RepoStatus;
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        expect(response.ok).toBe(true);
        return response.json();
    }
    function current(): RevId { return { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: status.working_copy }; }
    async function mutate(command: string, mutation: object) {
        let result = await request<MutationResult>(`mutate/${command}`, { mutation, options: { ignore_immutable: false } });
        if (result.type !== "Updated") throw Error(JSON.stringify(result));
        status = result.new_status;
        if (result.new_selection) return result.new_selection.id;
        let summary = await request<RevisionSummaryResult>("query/query_revision_summary", { set: { from: current(), to: current() } });
        if (summary.type !== "Detail") throw Error("missing current revision");
        return summary.headers[0].id;
    }
    async function snapshot() { status = await request<RepoStatus | null>("query/query_snapshot") ?? status; }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        await mkdir("e2e/results", { recursive: true });
        let lines = Array.from({ length: 30 }, (_, index) => `base-${index}\n`);
        await writeFile(join(ctx.tempDir, "range.txt"), lines.join(""));
        url = await startGG(ctx);
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw Error("missing fixture workspace");
        status = config.status;
        await snapshot();
        await mutate("create_revision", { set: { from: current(), to: current() } });
        lines[10] = "first contribution\n";
        await writeFile(join(ctx.tempDir, "range.txt"), lines.join("")); await snapshot();
        first = await mutate("describe_revision", { id: current(), new_description: "range first contribution", reset_author: false });
        await mutate("create_revision", { set: { from: first, to: first } });
        lines[25] = "last contribution\n"; lines.unshift("prefix\n");
        await writeFile(join(ctx.tempDir, "range.txt"), lines.join("")); await snapshot();
        last = await mutate("describe_revision", { id: current(), new_description: "range last contribution", reset_author: false });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("links separate surviving hunks and routes their notes to their own revisions", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.goto(`${url}/?inspect=${last.commit.hex}&inspectFrom=${first.commit.hex}&file=range.txt`);
        await ctx.page.locator(".hunk-actions summary").click();
        await expect.poll(() => ctx.page.locator(".range-hunk").count()).toBe(3);
        let origins = await ctx.page.locator(".range-hunk .origin").allTextContents();
        expect(origins).toContain(first.change.hex.slice(0, 8));
        expect(origins).toContain(last.change.hex.slice(0, 8));
        let earlier = ctx.page.locator(".range-hunk").filter({ has: ctx.page.getByText(first.change.hex.slice(0, 8), { exact: true }) });
        await earlier.getByRole("button", { name: "Annotate hunk" }).click();
        await ctx.page.getByRole("menuitem", { name: "Annotate hunk…" }).click();
        await ctx.page.getByRole("textbox", { name: "Note" }).waitFor();
        await ctx.page.getByRole("textbox", { name: "Note" }).fill("Review earlier contribution");
        await ctx.page.getByRole("button", { name: "Save note" }).click();
        await expect.poll(async () => {
            let list = await request<AnnotationList>("annotate/annotations", { request: { type: "List" } });
            return list.threads.find(note => note.posts.some(post => post.body === "Review earlier contribution"))?.targets[0]?.anchor.commit_id;
        }).toBe(first.commit.hex);
        await ctx.page.getByRole("button", { name: "Mark file as reviewed", exact: true }).click();
        await expect.poll(async () => {
            let progress = await request<ReviewProgress>("annotate/review_progress", { request: { type: "List" } });
            return progress.changes.filter(change => change.files.some(file => file.path === "range.txt" && file.state === "reviewed")).map(change => change.change_id);
        }).toEqual([last.change.hex]);
        await ctx.page.screenshot({ path: "e2e/results/range-review.png" });
        await earlier.getByRole("button", { name: first.change.hex.slice(0, 8), exact: true }).click();
        await expect.poll(async () => (await ctx.page.locator(".graph .selected .desc").allTextContents()).map(text => text.trim().endsWith("range first contribution"))).toEqual([true]);
        await expect.poll(() => ctx.page.locator(".range-hunk").count()).toBe(0);
    });
    it("shows each scattered change with its own diff", async () => {
        await ctx.page.goto(url);
        let rows = ctx.page.locator(".graph .selection-item");
        await rows.filter({ hasText: "range first contribution" }).first().click();
        await rows.filter({ hasText: "range last contribution" }).first().click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
        await expect.poll(() => ctx.page.locator(".selection-review > details").count()).toBe(2);
        await expect.poll(() => ctx.page.locator(".selection-review").textContent()).toContain("range first contribution");
        await expect.poll(() => ctx.page.locator(".selection-review").textContent()).toContain("range last contribution");
        await ctx.page.locator(".selection-review > details").nth(1).locator("summary").first().click();
        await ctx.page.getByRole("combobox", { name: `File in ${first.change.hex.slice(0, 8)}` }).waitFor();
        await ctx.page.getByRole("combobox", { name: `File in ${last.change.hex.slice(0, 8)}` }).waitFor();
        await expect.poll(() => ctx.page.locator(".selection-review .changes-module").count()).toBe(2);
    });
});
