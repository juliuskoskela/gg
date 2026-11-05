import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RepoStatus } from "../app/messages/RepoStatus";
import type { RevsResult } from "../app/messages/RevsResult";
import type { MutationResult } from "../app/messages/MutationResult";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("redo after an external jj undo", () => {
    let ctx: TestContext;
    let url: string;

    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
        await ctx.page.setViewportSize({ width: 1400, height: 900 });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        expect(response.ok).toBe(true);
        return response.json();
    }
    function jj(args: string[]) {
        return execFileSync("jj", ["--no-pager", "--repository", ctx.tempDir, ...args], { encoding: "utf8" });
    }
    function description() {
        // the independent oracle must not snapshot and consume the undo operation
        return jj(["--ignore-working-copy", "log", "--no-graph", "-r", "@", "-T", "description"]);
    }

    it("refreshes external undo status, keeps Redo visible, and restores the revision description", async () => {
        let workspace = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (workspace.type !== "Workspace") throw new Error("Missing fixture workspace");
        let status = await request<RepoStatus | null>("query/query_snapshot") ?? workspace.status;
        let id = {
            change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false },
            commit: status.working_copy,
        };
        let selected = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
        if (selected.type !== "Detail" || selected.headers.length !== 1) throw new Error("Missing fixture revision");
        let original = description();
        let updated = "Restore this description after external undo\n";
        let result = await request<MutationResult>("mutate/describe_revision", {
            mutation: { id: selected.headers[0].id, new_description: updated, reset_author: false },
            options: { ignore_immutable: false },
        });
        expect(result.type).toBe("Updated");
        expect(description()).toBe(updated);

        await ctx.page.goto(`${url}/?inspect=@`);
        let redo = ctx.page.getByRole("button", { name: "Redo the latest undone operation", exact: true });
        await expect.poll(() => redo.isVisible()).toBe(true);
        await expect.poll(() => redo.isDisabled()).toBe(true);

        jj(["undo"]);
        expect(description()).toBe(original);
        let external = await request<RepoStatus | null>("query/query_snapshot");
        expect(external?.operation_description).toMatch(/^undo: restore to operation /);
        expect(external?.can_redo).toBe(true);

        await ctx.page.getByRole("button", { name: "Refresh repository", exact: true }).click();
        await expect.poll(() => redo.isEnabled()).toBe(true);
        expect(await redo.isVisible()).toBe(true);
        await redo.click();
        await expect.poll(description).toBe(updated);
        await expect.poll(() => redo.isDisabled()).toBe(true);
        expect(await redo.isVisible()).toBe(true);
        let restored = await request<RepoStatus>("query/query_current_status");
        expect(restored.operation_description).toMatch(/^redo: restore to operation /);
        expect(restored.can_redo).toBe(false);
    });
    it.each([1024, 390, 320])("keeps primary repository actions visible at %ipx", async width => {
        await ctx.page.setViewportSize({ width, height: 960 });
        await ctx.page.goto(`${url}/?inspect=@`);
        for (let name of ["Fetch remote bookmarks", "Push all bookmarks", "Undo the latest operation", "Redo the latest undone operation", "Refresh repository", "Commands"]) {
            let action = ctx.page.getByRole("button", { name, exact: true });
            await expect.poll(() => action.isVisible()).toBe(true);
            let box = (await action.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width === 1024) expect((await ctx.page.locator(".workspace-topbar").boundingBox())?.height).toBe(40);
        let remote = ctx.page.getByRole("combobox", { name: "Git remote" });
        expect(await remote.isVisible()).toBe(true);
        let arrow = ctx.page.locator(".remote-select .select-chevron svg");
        expect((await arrow.boundingBox())?.width).toBe(16);
        expect(await ctx.page.locator(".remote-select .select-chevron").evaluate(element => getComputedStyle(element).pointerEvents)).toBe("none");
    });

});
