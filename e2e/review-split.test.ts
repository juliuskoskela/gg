import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RevsResult } from "../app/messages/RevsResult";
import type { RevId } from "../app/messages/RevId";
import type { SplitOutcome } from "../app/messages/SplitOutcome";
import type { SplitReceiptState } from "../app/messages/SplitReceiptState";
import type { MutationResult } from "../app/messages/MutationResult";
import type { ReviewProgress } from "../app/messages/ReviewProgress";
import type { ReviewDelta } from "../app/messages/ReviewDelta";

describe("guarded review split", () => {
    let ctx: TestContext, url: string, source: RevId;
    let errors: string[] = [];
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${endpoint}: ${await response.text()}`);
        return response.json();
    }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        ctx.page.on("pageerror", error => errors.push(error.message));
        await writeFile(join(ctx.tempDir, "first.txt"), "first file\n");
        await writeFile(join(ctx.tempDir, "second.txt"), "second file\n");
        url = await startGG(ctx);
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw new Error("Missing workspace");
        let alias = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: config.status.working_copy };
        let revisions = await request<RevsResult>("query/query_revisions", { set: { from: alias, to: alias } });
        if (revisions.type !== "Detail") throw new Error("Missing revision");
        source = revisions.headers[0].id;
        await request("annotate/review_progress", { request: { type: "Set", id: source, path: null, reviewed: true } });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    it("shows a phone-size confirmation, splits once, and recovers exact ownership after reload and undo", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 900 });
        await ctx.page.goto(`${url}/?inspect=${source.commit.hex}`);
        await expect.poll(() => errors, { timeout: 1000 }).toEqual([]);
        try { await ctx.page.locator(".graph .selection-item").first().click(); }
        catch (error) {
            await mkdir("e2e/results/review-split", { recursive: true });
            await ctx.page.screenshot({ path: "e2e/results/review-split/startup-failure.png", fullPage: true });
            throw new Error(`${String(error)}\nBrowser errors: ${errors.join("; ")}\nPage: ${await ctx.page.locator("body").innerText()}`);
        }
        await ctx.page.keyboard.press("Control+k");
        let commands = ctx.page.getByRole("dialog", { name: "Commands", exact: true });
        await commands.getByRole("textbox", { name: "Commands" }).fill("Split change");
        await commands.getByRole("button", { name: /Split change/ }).click();
        let picker = ctx.page.getByRole("dialog", { name: "Split change", exact: true });
        await picker.getByLabel("File: first.txt").check();
        await picker.getByLabel("First title").fill("First part");
        await picker.getByLabel("Remaining title").fill("Second part");
        await picker.getByRole("button", { name: "Enter", exact: true }).click();
        let confirmation = ctx.page.getByRole("dialog", { name: "Confirm split", exact: true });
        await confirmation.waitFor();
        expect(await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] })).toEqual([]);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await mkdir("e2e/results/review-split", { recursive: true });
        await ctx.page.screenshot({ path: "e2e/results/review-split/phone-confirmation.png", fullPage: true });
        await confirmation.getByLabel("Action").selectOption("Split");
        await confirmation.getByRole("button", { name: "Enter", exact: true }).click();
        await expect.poll(async () => (await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] })).length).toBe(1);
        let [receipt] = await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] });
        expect((await request<SplitReceiptState[]>("query/query_split_receipt_states", { ids: [source] }))[0].state).toBe("active");
        expect(receipt.selected.change.hex).toBe(source.change.hex);
        expect(receipt.remainder.change.hex).not.toBe(source.change.hex);
        expect(await request<SplitOutcome[]>("query/query_split_receipts", { ids: [{ ...source, commit: receipt.selected.commit }] })).toEqual([]);
        await ctx.page.reload();
        expect((await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] }))[0].receipt_id).toBe(receipt.receipt_id);
        let reviews = await request<ReviewProgress>("annotate/review_progress", { request: { type: "List" } });
        let moved = reviews.changes.find(change => change.change_id === receipt.remainder.change.hex)!.files[0];
        expect(moved.path).toBe("second.txt"); expect(moved.reviewed_commit_id).toBe(source.commit.hex); expect(moved.reviewed_change_id).toBe(source.change.hex);
        let delta = await request<ReviewDelta>("query/query_review_delta", { request: { from: source, to: receipt.remainder, path: "second.txt", full_context: false } });
        expect(delta.type).toBe("Ready"); if (delta.type === "Ready") expect(delta.changes).toEqual([]);
        expect((await request<ReviewDelta>("query/query_review_delta", { request: { from: source, to: receipt.remainder, path: null, full_context: false } })).type).toBe("Unavailable");
        expect((await request<MutationResult>("mutate/undo_operation", { mutation: {}, options: { ignore_immutable: false } })).type).toBe("Updated");
        expect(await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] })).toEqual([]);
        expect((await request<SplitReceiptState[]>("query/query_split_receipt_states", { ids: [source] }))[0].state).toBe("inactive");
        expect((await request<MutationResult>("mutate/redo_operation", { mutation: {}, options: { ignore_immutable: false } })).type).toBe("Updated");
        expect((await request<SplitOutcome[]>("query/query_split_receipts", { ids: [source] }))[0].receipt_id).toBe(receipt.receipt_id);
    });
});
