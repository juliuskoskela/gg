import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness.js";

async function showTab(page: Page, name: string) {
    let tab = page.getByRole("tab", { name, exact: true });
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await expect.poll(() => tab.getAttribute("aria-selected")).toBe("true");
}

// Every mutation targets a temporary copy of the bundled fixture.
async function makeRepository(ctx: TestContext, backend: string) {
    let request = async (endpoint: string, args: object = {}) => {
        let response = await fetch(`${backend}/api/${endpoint}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...args, client_id: "inspector-fixture" }),
        });
        if (!response.ok) throw new Error(`Fixture request failed: ${endpoint} ${response.status}`);
        return response.json();
    };
    let workspace = await request("query/query_workspace", { path: ctx.tempDir });
    if (workspace.type !== "Workspace") throw new Error("Fixture workspace unavailable");
    let status = await request("query/query_snapshot") ?? workspace.status;
    let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: status.working_copy };
    for (let i = 0; i < 105; i++) {
        let result = await request("mutate/create_revision", { mutation: { set: { from: id, to: id } }, options: { ignore_immutable: false } });
        if (result.type !== "Updated" || !result.new_selection) throw new Error(`Fixture revision ${i}: ${JSON.stringify(result)}`);
        id = result.new_selection.id;
    }
    let dir = ctx.tempDir;
    let path = join(dir, "src", "internationalization", "customer-account-settings", "migration");
    mkdirSync(path, { recursive: true });
    for (let i = 0; i < 30; i++) {
        writeFileSync(join(path, `account-preferences-migration-step-${String(i).padStart(2, "0")}.txt`),
            Array.from({ length: i === 0 ? 500 : 2 }, (_, line) => `Migration step ${i}, configuration line ${line}\n`).join(""));
    }
}

describe("compact workspace inspector", () => {
    let ctx: TestContext;
    let backend: string;
    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        let config = join(ctx.tempDir, ".jj", "repo", "config.toml");
        writeFileSync(config, readFileSync(config, "utf8").replace('ui.theme-override = "light"', 'ui.theme-override = ""'));
        backend = await startGG(ctx);
        await makeRepository(ctx, backend);
        await ctx.page.setViewportSize({ width: 390, height: 844 });
    });
    afterEach(async () => destroyContext(ctx));

    it("opens the selected revision as a reversible route and restores it after refresh", async () => {
        let config = await fetch(`${backend}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir, client_id: "inspect-route" }) }).then(response => response.json());
        let snapshot = await fetch(`${backend}/api/query/query_snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "inspect-route" }) }).then(response => response.json());
        let inspect = (snapshot ?? config.status).working_copy.hex as string;
        await ctx.page.goto(`${backend}/?inspect=${inspect}`);
        await expect.poll(() => ctx.page.locator(".file-tree").textContent()).toContain("account-preferences-migration-step-00.txt");
        expect(new URL(ctx.page.url()).searchParams.get("inspect")).toBe(inspect);
        await showTab(ctx.page, "Timeline");
        await expect.poll(() => ctx.page.locator(".graph").isVisible()).toBe(true);
        await ctx.page.reload();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toBe(inspect);
        await expect.poll(() => ctx.page.locator(".file-tree").textContent()).toContain("account-preferences-migration-step-00.txt");
        await showTab(ctx.page, "Timeline");
        await expect.poll(() => ctx.page.locator(".graph").isVisible()).toBe(true);
    });

    it("keeps the timeline selected when a revision is chosen", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        expect(await ctx.page.getByRole("region", { name: "Revision preview" }).count()).toBe(0);
        expect(await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).getAttribute("aria-selected")).toBe("true");
        await showTab(ctx.page, "Description");
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("Working copy");
        expect(await ctx.page.locator("#panel-tab-tree").textContent()).toContain("30");
    });
    it("keeps the dock inside compact widths", async () => {
        await ctx.page.emulateMedia({ reducedMotion: "reduce" });
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        for (let width of [360, 390, 430, 768]) {
            await ctx.page.setViewportSize({ width, height: 844 });
            for (let selector of [".workspace-topbar", ".workspace-dock"]) {
                let bounds = (await ctx.page.locator(selector).boundingBox())!;
                expect(bounds.x).toBeGreaterThanOrEqual(0);
                expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
            }
            expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
    });

    it("renders the summary before a delayed file and rejects its obsolete response", async () => {
        let releaseFirst!: () => void;
        let gate = new Promise<void>(resolve => { releaseFirst = resolve; });
        let paths: string[] = [];
        await ctx.page.route("**/api/query/query_revision_diff", async route => {
            let body = route.request().postDataJSON();
            let path: string = body.path.repo_path;
            paths.push(path);
            let response = await route.fetch();
            if (path.endsWith("step-00.txt")) await gate;
            await route.fulfill({ response });
        });
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await expect.poll(() => ctx.page.locator("#panel-tab-tree").textContent()).toContain("30");
        expect(new Set(paths).size).toBeLessThanOrEqual(1);
        await showTab(ctx.page, "Diff");
        await expect.poll(() => paths.some(path => path.endsWith("step-00.txt"))).toBe(true);
        await expect.poll(() => ctx.page.getByRole("region", { name: "File diff" }).textContent()).toContain("Loading");
        await ctx.page.getByRole("button", { name: "Next changed file" }).click();
        await expect.poll(() => paths.some(path => path.endsWith("step-01.txt"))).toBe(true);
        let diff = ctx.page.getByRole("region", { name: "File diff" });
        await diff.getByText("Migration step 1, configuration line 0", { exact: false }).first().waitFor();
        releaseFirst();
        await ctx.page.waitForTimeout(250);
        expect(await diff.getByText("Migration step 1, configuration line 0", { exact: false }).count()).toBeGreaterThan(0);
        expect(await diff.getByText("Migration step 0, configuration line 0", { exact: false }).count()).toBe(0);
        expect(new Set(paths).size).toBe(2);
    });

    it("offers explicit recovery for a requested file absent from the revision", async () => {
        let config = await fetch(`${backend}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir, client_id: "missing-file-fixture" }) }).then(response => response.json());
        let snapshot = await fetch(`${backend}/api/query/query_snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "missing-file-fixture" }) }).then(response => response.json());
        await ctx.page.goto(`${backend}/?inspect=${(snapshot ?? config.status).working_copy.hex}&file=missing%2Ffile.txt`);
        await showTab(ctx.page, "Diff");
        await ctx.page.getByRole("heading", { name: "File no longer available" }).waitFor();
        expect(await ctx.page.getByRole("button", { name: "Choose another file" }).count()).toBe(0);
        await showTab(ctx.page, "Files");
        await ctx.page.getByRole("searchbox", { name: "Filter changed files" }).waitFor();
        expect(new URL(ctx.page.url()).searchParams.get("file")).toBe("missing/file.txt");
    });

    it("searches files and restores each diff's scroll position", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Files");
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("migration-step-20");
        await ctx.page.getByText("account-preferences-migration-step-20.txt", { exact: true }).click();
        await showTab(ctx.page, "Diff");
        await expect.poll(() => ctx.page.locator(".diff-toolbar").textContent()).toContain("step-20.txt");
        await showTab(ctx.page, "Files");
        await search.fill("migration-step-00");
        await ctx.page.getByText("account-preferences-migration-step-00.txt", { exact: true }).click();
        await showTab(ctx.page, "Diff");
        let diff = ctx.page.locator(".diff-scroll");
        await expect.poll(() => diff.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(1000);
        await diff.evaluate(el => { el.scrollTop = 600; });
        await expect.poll(() => diff.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
        await ctx.page.getByRole("button", { name: "Next changed file" }).click();
        await ctx.page.getByRole("button", { name: "Previous changed file" }).click();
        await expect.poll(() => diff.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
    });

    it("retains file 20 and graph anchor through browser Back and Forward", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await ctx.page.locator(".graph .selection-item").first().click();
        await expect.poll(() => graph.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(1000);
        await graph.evaluate(el => { el.scrollTop = 500; });
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBeGreaterThan(400);
        let graphPosition = await graph.evaluate(el => el.scrollTop);
        await showTab(ctx.page, "Files");
        await ctx.page.getByRole("searchbox", { name: "Filter changed files" }).fill("migration-step-20");
        await ctx.page.getByText("account-preferences-migration-step-20.txt", { exact: true }).click();
        await showTab(ctx.page, "Diff");
        await expect.poll(() => ctx.page.locator(".diff-toolbar").textContent()).toContain("step-20.txt");
        await showTab(ctx.page, "Timeline");
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBe(graphPosition);
        await showTab(ctx.page, "Diff");
        await expect.poll(() => ctx.page.locator(".diff-toolbar").textContent()).toContain("step-20.txt");
    });

    it("retains graph position and keyboard focus through inspection", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await graph.waitFor();
        await ctx.page.locator(".graph .selection-item").first().click();
        await expect.poll(() => graph.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(1000);
        await graph.evaluate(el => { el.scrollTop = 1000; });
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
        await graph.focus();
        await graph.press("ArrowDown");
        expect(await graph.evaluate(el => document.activeElement === el)).toBe(true);
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBeLessThan(500);
        await graph.evaluate(el => { el.scrollTop = 1000; });
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
        let position = await graph.evaluate(el => el.scrollTop);
        expect(await graph.evaluate(element => element.closest("[inert]"))).toBeNull();
        await showTab(ctx.page, "Description");
        await showTab(ctx.page, "Timeline");
        expect(await graph.evaluate(element => element.closest("[inert]"))).toBeNull();
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBe(position);
    });

    it("keeps the last graph row reachable above the half sheet", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await ctx.page.locator(".graph .selection-item").first().click();
        await graph.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await expect.poll(() => graph.evaluate(el => el.scrollTop + el.clientHeight)).toBeGreaterThan(1000);
        let last = ctx.page.locator(".graph .selection-item").last();
        await expect.poll(async () => {
            let row = await last.boundingBox();
            let graphBounds = await graph.boundingBox();
            return !!row && !!graphBounds && row.y >= graphBounds.y - 1 && row.y + row.height <= graphBounds.y + graphBounds.height + 1;
        }).toBe(true);
    });

    it("shows the latest keyboard selection when revision responses arrive out of order", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await ctx.page.locator(".graph .selection-item").first().waitFor();
        await ctx.page.locator(".graph .selection-item").first().click();
        await expect.poll(() => ctx.page.locator(".description-panel .revision-id").textContent()).toBeTruthy();
        let delayed = false;
        await ctx.page.route("**/api/query/query_revision_summary", async route => {
            let response = await route.fetch();
            if (!delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 600)); }
            await route.fulfill({ response });
        });
        await graph.focus();
        await graph.press("ArrowDown");
        for (let i = 1; i < 10; i++) await graph.press("ArrowDown");
        let selected = ctx.page.locator('.graph .selection-item[aria-selected="true"] .id').last();
        let expected = (await selected.textContent())!.trim();
        await expect.poll(async () => (await ctx.page.locator(".description-panel .revision-id").textContent())?.trim()).toContain(expected);
        await ctx.page.waitForTimeout(750);
        expect((await ctx.page.locator(".description-panel .revision-id").textContent())?.trim()).toContain(expected);
    });

    it("navigates and searches a virtualized list of over 200 changed files", async () => {
        let bulk = join(ctx.tempDir, "bulk");
        mkdirSync(bulk, { recursive: true });
        for (let i = 0; i < 240; i++) writeFileSync(join(bulk, `item-${String(i).padStart(3, "0")}.txt`), `File ${i}\n`);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Files");
        let list = ctx.page.locator(".virtual-files");
        await list.waitFor();
        // visibility can precede the resize observer that establishes virtual row geometry
        await expect.poll(() => list.evaluate(el => {
            let rowHeight = el.querySelector(".row-measure")!.getBoundingClientRect().height;
            let space = el.querySelector(".file-space")!.getBoundingClientRect().height;
            return rowHeight > 0 && space === 270 * rowHeight && el.scrollHeight > el.clientHeight;
        })).toBe(true);
        expect(await list.locator("[data-file-index]").count()).toBeLessThan(40);
        await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await expect.poll(() => list.locator('[data-file-index="269"]').count()).toBe(1);
        await list.evaluate(el => { el.scrollTop = 0; });
        let first = list.locator('[data-file-index="0"] button');
        await first.waitFor();
        await first.focus();
        await first.press("End");
        await expect.poll(() => list.locator('[data-file-index="269"] button').evaluate(el => document.activeElement === el)).toBe(true);
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("item-187.txt");
        await expect.poll(() => list.locator("[data-file-index]").count()).toBe(1);
        await list.getByRole("option", { name: /item-187\.txt/ }).click();
        await showTab(ctx.page, "Diff");
        await expect.poll(() => ctx.page.locator(".diff-toolbar").textContent()).toContain("item-187.txt");
        expect(await ctx.page.locator('.diff-toolbar [title="bulk/item-187.txt"]').count()).toBeGreaterThan(0);
    });

    it("moves a selected file by command, makes cancellation a no-op, and undoes the move", async () => {
        let path = "src/internationalization/customer-account-settings/migration/account-preferences-migration-step-00.txt";
        let getPaths = async () => {
            let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
            let response = await fetch(`${backend}/api/query/query_revision_summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { from: id, to: id }, client_id: "move-assertion" }) });
            let result = await response.json();
            return result.changes.map((change: { path: { repo_path: string } }) => change.path.repo_path);
        };
        let mutations: string[] = [];
        ctx.page.on("request", request => { if (request.url().includes("/api/mutate/")) mutations.push(request.url().split("/").pop()!); });
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Files");
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("migration-step-00");
        await ctx.page.getByText("account-preferences-migration-step-00.txt", { exact: true }).click();
        let command = async () => {
            await ctx.page.keyboard.press("Control+k");
            let palette = ctx.page.getByRole("dialog", { name: "Commands" });
            await palette.getByRole("textbox", { name: "Commands" }).fill("Move file changes to");
            await palette.getByRole("button", { name: /Move file changes to/ }).click();
        };
        await command();
        let destination = ctx.page.getByRole("dialog", { name: "Move changes to" });
        await destination.getByRole("button", { name: "Cancel" }).click();
        expect(mutations).toEqual([]);
        await expect.poll(getPaths).toContain(path);
        await command();
        await destination.getByLabel("Bookmark or revset").fill("@-");
        await destination.getByRole("button", { name: "Use" }).click();
        let review = ctx.page.getByRole("dialog", { name: "Review move" });
        await review.waitFor();
        expect(await review.textContent()).toContain(path);
        await review.getByRole("combobox", { name: "Action" }).selectOption("Move");
        let response = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/move_changes"));
        await review.getByRole("button", { name: "Enter" }).click();
        let moved = await response;
        expect(moved.ok()).toBe(true);
        expect((await moved.json()).type).toBe("Updated");
        await expect.poll(() => mutations).toContain("move_changes");
        await expect.poll(getPaths).not.toContain(path);
        let undo = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/undo_operation"));
        await ctx.page.keyboard.press("Control+z");
        expect((await undo).ok()).toBe(true);
        await expect.poll(getPaths).toContain(path);
        let redo = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/redo_operation"));
        await ctx.page.keyboard.press("Control+Shift+z");
        expect((await redo).ok()).toBe(true);
        await expect.poll(getPaths).not.toContain(path);
    });

    it("moves a selected hunk through the destination flow and restores it with Undo", async () => {
        let path = "src/internationalization/customer-account-settings/migration/account-preferences-migration-step-00.txt";
        let getPaths = async () => {
            let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
            let response = await fetch(`${backend}/api/query/query_revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { from: id, to: id }, client_id: "hunk-assertion" }) });
            let result = await response.json();
            return JSON.stringify(result.changes.find((change: { path: { repo_path: string } }) => change.path.repo_path === path)?.hunks ?? []);
        };
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Diff");
        let actions = ctx.page.locator(".hunk-actions");
        await actions.locator("summary").click();
        await actions.getByRole("option").first().click();
        let before = await getPaths();
        let openMove = async () => {
            await ctx.page.keyboard.press("Control+k");
            let palette = ctx.page.getByRole("dialog", { name: "Commands" });
            await palette.getByRole("textbox", { name: "Commands" }).fill("Move hunk changes to");
            await palette.getByRole("button", { name: /Move hunk changes to/ }).click();
        };
        await openMove();
        let destination = ctx.page.getByRole("dialog", { name: "Move changes to" });
        await destination.getByRole("button", { name: "Cancel" }).click();
        expect(await getPaths()).toBe(before);
        await openMove();
        await destination.getByLabel("Bookmark or revset").fill("@-");
        await destination.getByRole("button", { name: "Use" }).click();
        let review = ctx.page.getByRole("dialog", { name: "Review move" });
        await review.waitFor();
        expect(await review.textContent()).toContain("hunk");
        await review.getByRole("combobox", { name: "Action" }).selectOption("Move");
        let response = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/move_hunk"));
        await review.getByRole("button", { name: "Enter" }).click();
        let moved = await response;
        expect(moved.ok()).toBe(true);
        expect((await moved.json()).type).toBe("Updated");
        await expect.poll(getPaths).not.toBe(before);
        let undo = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/undo_operation"));
        await ctx.page.keyboard.press("Control+z");
        expect((await undo).ok()).toBe(true);
        await expect.poll(getPaths).toBe(before);
    });

    it("moves a local bookmark by command and restores its exact target with Undo", async () => {
        let resolveCommit = async (expression: string) => {
            let id = { change: { type: "ChangeId", hex: expression, prefix: expression, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
            let response = await fetch(`${backend}/api/query/query_revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { from: id, to: id }, client_id: "bookmark-assertion" }) });
            return (await response.json()).headers[0].id.commit.hex as string;
        };
        let original = await resolveCommit("main");
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().waitFor();
        let target = await resolveCommit("@");
        expect(target).not.toBe(original);
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("main");
        await filter.press("Tab");
        let bookmark = ctx.page.locator(".graph").getByRole("option", { name: /^main;/ });
        await bookmark.click();
        let openMove = async () => {
            await ctx.page.keyboard.press("Control+k");
            let palette = ctx.page.getByRole("dialog", { name: "Commands" });
            await palette.getByRole("textbox", { name: "Commands" }).fill("Move bookmark to");
            await palette.getByRole("button", { name: /Move bookmark to/ }).click();
        };
        await openMove();
        let destination = ctx.page.getByRole("dialog", { name: "Move bookmark to" });
        await destination.getByRole("button", { name: "Cancel" }).click();
        expect(await resolveCommit("main")).toBe(original);
        await openMove();
        await destination.getByLabel("Bookmark or revset").fill("@");
        await destination.getByRole("button", { name: "Use" }).click();
        let review = ctx.page.getByRole("dialog", { name: "Review move" });
        await review.waitFor();
        expect(await review.textContent()).toContain("main");
        await review.getByRole("combobox", { name: "Action" }).selectOption("Move");
        let response = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/move_ref"));
        await review.getByRole("button", { name: "Enter" }).click();
        let moved = await response;
        expect((await moved.json()).type).toBe("Updated");
        await expect.poll(() => resolveCommit("main")).toBe(target);
        let undo = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/undo_operation"));
        await ctx.page.keyboard.press("Control+z");
        expect((await undo).ok()).toBe(true);
        await expect.poll(() => resolveCommit("main")).toBe(original);
    });

    it("keeps a description draft through an unambiguous external rewrite", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Description");
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        if (!await editor.isVisible()) await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        await editor.fill("Unfinished draft\nsecond line");
        let queryId = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
        let result = await fetch(`${backend}/api/query/query_revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { from: queryId, to: queryId }, client_id: "draft-fixture" }) }).then(response => response.json());
        let before = result.headers[0].id;
        let response = await fetch(`${backend}/api/mutate/describe_revision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutation: { id: before, new_description: "External rewrite", reset_author: false }, options: { ignore_immutable: false }, client_id: "draft-fixture" }) });
        let changed = await response.json();
        expect(changed.type).toBe("Updated");
        let queryCurrent = async () => {
            let response = await fetch(`${backend}/api/query/query_revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: { from: queryId, to: queryId }, client_id: "draft-fixture" }) });
            return (await response.json()).headers[0].id.commit.hex as string;
        };
        let after = await queryCurrent();
        expect(after).not.toBe(before.commit.hex);
        await ctx.page.keyboard.press("Control+k");
        let commands = ctx.page.getByRole("dialog", { name: "Commands" });
        await commands.getByRole("textbox", { name: "Commands" }).fill("Refresh repository");
        await commands.getByRole("button", { name: /Refresh repository/ }).click();
        await expect.poll(() => editor.inputValue()).toBe("Unfinished draft\nsecond line");
    });

    it("moves context-menu focus with arrows and restores focus on Escape", async () => {
        await ctx.page.goto(backend);
        let row = ctx.page.locator(".graph .selection-item").first();
        await row.focus();
        await row.click({ button: "right" });
        let menu = ctx.page.getByRole("menu");
        let items = menu.getByRole("menuitem");
        await items.first().waitFor();
        expect(await menu.evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("ArrowDown");
        expect(await items.first().evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("ArrowDown");
        expect(await items.nth(1).evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("End");
        expect(await items.last().evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("Home");
        expect(await items.first().evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("Escape");
        expect(await menu.count()).toBe(0);
        expect(await row.evaluate(element => element === document.activeElement)).toBe(true);
    });

    it("restores horizontal position when switching between files", async () => {
        let path = join(ctx.tempDir, "src", "internationalization", "customer-account-settings", "migration", "account-preferences-migration-step-00.txt");
        writeFileSync(path, `${readFileSync(path, "utf8")}configuration_value = "${"long-setting-".repeat(80)}"\n`);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await showTab(ctx.page, "Diff");
        let column = ctx.page.locator('.diff-viewer [data-overflow="scroll"] [data-code]:not([data-diffs-scrollbar-measure])').first();
        await expect.poll(() => column.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(500);
        await column.evaluate(el => { el.scrollLeft = 400; el.dispatchEvent(new Event("scroll")); });
        await expect.poll(() => column.evaluate(el => el.scrollLeft)).toBeGreaterThan(300);
        let saved = await column.evaluate(el => el.scrollLeft);
        await ctx.page.getByRole("button", { name: "Next changed file" }).click();
        await ctx.page.getByRole("button", { name: "Previous changed file" }).click();
        await expect.poll(() => column.evaluate(el => el.scrollLeft)).toBe(saved);
    });

    it("switches persisted history density while keeping graph geometry and reading position", async () => {
        await ctx.page.goto(backend);
        // authors are one option in the timeline's display menu
        let display = ctx.page.getByRole("button", { name: "Timeline display" });
        let authors = ctx.page.getByRole("menuitemcheckbox", { name: "Authors" });
        let authorsShown = async () => { if (!await authors.isVisible()) await display.click(); let checked = await authors.getAttribute("aria-checked"); await ctx.page.keyboard.press("Escape"); return checked; };
        let row = ctx.page.locator(".graph .selection-item").first();
        await row.waitFor();
        expect(await ctx.page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
        expect(await authorsShown()).toBe("false");
        let metrics = await row.evaluate(element => {
            let center = (rect: DOMRect) => rect.y + rect.height / 2;
            let bounds = element.getBoundingClientRect();
            let id = element.querySelector(".id")!.getBoundingClientRect();
            let description = element.querySelector(".desc")!.getBoundingClientRect();
            let transform = element.closest("g")!.getAttribute("transform");
            // rows and stations share a row transform inside the graph's bleed offset
            let station = [...element.closest("svg")!.querySelectorAll<SVGGElement>("g[transform]")].find(group => group !== element.closest("g") && group.getAttribute("transform") === transform && group.querySelector(".station"));
            if (!station) throw new Error("Revision has no graph station at its row position");
            let node = station.querySelector(".station")!.getBoundingClientRect();
            return { height: bounds.height, row: center(bounds), id: center(id), description: center(description), node: center(node) };
        });
        expect(metrics.height).toBe(28);
        expect(Math.abs(metrics.row - metrics.id)).toBeLessThanOrEqual(2);
        expect(Math.abs(metrics.row - metrics.description)).toBeLessThanOrEqual(2);
        expect(Math.abs(metrics.row - metrics.node)).toBeLessThanOrEqual(2);
        expect(await row.locator(".author").count()).toBe(0);
        let list = ctx.page.getByRole("listbox", { name: "Revision List" });
        await list.evaluate(element => { element.scrollTop = 280; });
        await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(280);
        let topLabel = () => list.evaluate(element => {
            let top = element.getBoundingClientRect().top;
            return [...element.querySelectorAll('.graph .selection-item')]
                .filter(row => row.getBoundingClientRect().bottom > top + 1)
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]?.getAttribute("aria-label");
        });
        let anchor = await topLabel();
        await display.click();
        await authors.click();
        await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(480);
        expect(await topLabel()).toBe(anchor);
        let tallMetrics = await row.evaluate(element => {
            let id = element.querySelector(".id")!.getBoundingClientRect();
            let description = element.querySelector(".desc")!.getBoundingClientRect();
            let author = element.querySelector(".author")!;
            let transform = element.closest("g")!.getAttribute("transform");
            let station = [...element.closest("svg")!.querySelectorAll<SVGGElement>("g[transform]")].find(group => group !== element.closest("g") && group.getAttribute("transform") === transform && group.querySelector(".station"))!;
            let node = station.querySelector(".station")!.getBoundingClientRect();
            return { height: element.getBoundingClientRect().height, id: id.y + id.height / 2, description: description.y + description.height / 2, node: node.y + node.height / 2, authorTop: author.getBoundingClientRect().top, descriptionBottom: description.bottom, authorWeight: getComputedStyle(author).fontWeight, author: author.textContent };
        });
        expect(tallMetrics.height).toBe(48);
        expect(Math.abs(tallMetrics.id - tallMetrics.description)).toBeLessThanOrEqual(2);
        expect(Math.abs(tallMetrics.node - tallMetrics.description)).toBeLessThanOrEqual(2);
        expect(tallMetrics.authorTop).toBeGreaterThanOrEqual(tallMetrics.descriptionBottom);
        expect(tallMetrics.authorWeight).toBe("400");
        expect(tallMetrics.author).toBeTruthy();
        await ctx.page.reload();
        await row.waitFor();
        expect(await authorsShown()).toBe("true");
        expect((await row.boundingBox())!.height).toBe(48);
    });

    it("keeps compact history touch rows at 44px", async () => {
        let touch = await ctx.browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
        try {
            let page = await touch.newPage();
            await page.goto(backend);
            let row = page.locator(".graph .selection-item").first();
            await row.waitFor();
            expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
            expect((await row.boundingBox())!.height).toBe(44);
            await page.getByRole("button", { name: "Timeline display" }).click();
            await page.getByRole("menuitemcheckbox", { name: "Authors" }).click();
            await expect.poll(async () => (await row.boundingBox())?.height).toBe(48);
            expect(await row.locator(".author").textContent()).toBeTruthy();
        } finally {
            await touch.close();
        }
    });

    it("captures responsive light and dark workspace states without page overflow", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        for (let theme of ["light", "dark"] as const) {
            await ctx.page.emulateMedia({ colorScheme: theme });
            for (let width of [360, 390, 430, 768, 1024, 1440, 1920]) {
                await ctx.page.setViewportSize({ width, height: 900 });
                await ctx.page.screenshot({ path: `.taste-skill/studio/quality/workspace-${theme}-${width}.png` });
                expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            }
        }
        await ctx.page.setViewportSize({ width: 844, height: 390 });
        await ctx.page.screenshot({ path: ".taste-skill/studio/quality/workspace-landscape.png" });
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await ctx.page.screenshot({ path: ".taste-skill/studio/quality/workspace-large-text.png" });
        await ctx.page.evaluate(() => { document.documentElement.style.fontSize = ""; });
        await showTab(ctx.page, "Diff");
        await ctx.page.screenshot({ path: ".taste-skill/studio/quality/workspace-full.png" });
    });

});
