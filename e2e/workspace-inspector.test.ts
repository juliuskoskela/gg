import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness.js";

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
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        let sheet = ctx.page.getByRole("region", { name: "Revision preview" });
        await sheet.waitFor();
        await expect.poll(() => sheet.textContent()).toContain("30 changed files");
        await sheet.getByRole("button", { name: "Open full revision" }).click();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toMatch(/^[0-9a-f]+$/);
        let inspect = new URL(ctx.page.url()).searchParams.get("inspect");
        await ctx.page.reload();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toBe(inspect);
        await expect.poll(() => ctx.page.locator(".detail-region").textContent()).toContain("account-preferences-migration-step-00.txt");
        await ctx.page.goBack();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toBeNull();
        await ctx.page.goForward();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toBe(inspect);
    });

    it("collapses without exposing preview controls and ignores a cancelled drag", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        let sheet = ctx.page.getByRole("region", { name: "Revision preview" });
        let handle = sheet.getByRole("button", { name: "Collapse revision preview" });
        await handle.waitFor();
        let bounds = (await handle.boundingBox())!;
        await ctx.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 80);
        await handle.dispatchEvent("pointercancel", { pointerId: 1, button: 0 });
        await ctx.page.mouse.up();
        expect(await sheet.getAttribute("data-presentation")).toBe("half");
        await handle.click();
        expect(await sheet.getAttribute("data-presentation")).toBe("collapsed");
        expect(await sheet.getByRole("button", { name: "Open full revision" }).count()).toBe(0);
        expect(await sheet.getByRole("list", { name: "Changed file preview" }).count()).toBe(0);
        await sheet.getByRole("button", { name: /Preview revision:/ }).click();
        expect(await sheet.getAttribute("data-presentation")).toBe("half");
    });
    it("keeps preview in bounds and honors reduced motion across compact widths", async () => {
        await ctx.page.emulateMedia({ reducedMotion: "reduce" });
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        let sheet = ctx.page.getByRole("region", { name: "Revision preview" });
        await sheet.waitFor();
        for (let width of [360, 390, 430, 768]) {
            await ctx.page.setViewportSize({ width, height: 844 });
            let bounds = (await sheet.boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            expect(await sheet.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
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
        let sheet = ctx.page.getByRole("region", { name: "Revision preview" });
        await expect.poll(() => sheet.textContent()).toContain("30 changed files");
        expect(new Set(paths).size).toBeLessThanOrEqual(1);
        await sheet.getByRole("button", { name: "Open full revision" }).click();
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
        await ctx.page.getByRole("heading", { name: "File no longer available" }).waitFor();
        await ctx.page.getByRole("button", { name: "Choose another file" }).click();
        await ctx.page.getByRole("searchbox", { name: "Filter changed files" }).waitFor();
        expect(new URL(ctx.page.url()).searchParams.get("file")).toBe("missing/file.txt");
    });

    it("searches files and restores each diff's scroll position", async () => {
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("button", { name: "Choose changed file" }).click();
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("migration-step-20");
        await ctx.page.getByText("account-preferences-migration-step-20.txt", { exact: true }).click();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("file")).toContain("step-20.txt");
        await ctx.page.getByRole("button", { name: "Choose changed file" }).click();
        await search.fill("migration-step-00");
        await ctx.page.getByText("account-preferences-migration-step-00.txt", { exact: true }).click();
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("button", { name: "Choose changed file" }).click();
        await ctx.page.getByRole("searchbox", { name: "Filter changed files" }).fill("migration-step-20");
        await ctx.page.getByText("account-preferences-migration-step-20.txt", { exact: true }).click();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("file")).toContain("step-20.txt");
        let selected = ctx.page.url();
        await ctx.page.goBack();
        await expect.poll(() => ctx.page.getByRole("region", { name: "Revision preview" }).getAttribute("data-presentation")).toBe("half");
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBe(graphPosition);
        await ctx.page.goForward();
        await expect.poll(() => ctx.page.url()).toBe(selected);
        await expect.poll(() => ctx.page.locator(".diff-toolbar").textContent()).toContain("step-20.txt");
    });

    it("retains graph position and keyboard focus through inspection", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await graph.waitFor();
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        expect(await ctx.page.locator(".log-region").getAttribute("inert")).not.toBeNull();
        await ctx.page.getByRole("button", { name: "Back to graph" }).click();
        await expect.poll(() => graph.evaluate(el => el.scrollTop)).toBe(position);
    });

    it("keeps the last graph row reachable above the half sheet", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await ctx.page.locator(".graph .selection-item").first().click();
        let sheet = ctx.page.getByRole("region", { name: "Revision preview" });
        await sheet.waitFor();
        await graph.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await expect.poll(() => graph.evaluate(el => el.scrollTop + el.clientHeight)).toBeGreaterThan(1000);
        let last = ctx.page.locator(".graph .selection-item").last();
        let row = (await last.boundingBox())!;
        let sheetBounds = (await sheet.boundingBox())!;
        expect(row.y + row.height).toBeLessThanOrEqual(sheetBounds.y);
    });

    it("shows the latest keyboard selection when revision responses arrive out of order", async () => {
        await ctx.page.goto(backend);
        let graph = ctx.page.locator(".graph-body .listbox");
        await ctx.page.locator(".graph .selection-item").first().waitFor();
        await ctx.page.locator(".graph .selection-item").first().click();
        await ctx.page.locator(".revision-preview .identity").waitFor();
        let delayed = false;
        await ctx.page.route("**/api/query/query_revision_summary", async route => {
            let response = await route.fetch();
            if (!delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 600)); }
            await route.fulfill({ response });
        });
        await graph.focus();
        await graph.press("ArrowDown");
        expect(await ctx.page.locator(".revision-preview").count()).toBe(0);
        for (let i = 1; i < 10; i++) await graph.press("ArrowDown");
        let selected = ctx.page.locator('.graph .selection-item[aria-selected="true"] .id').last();
        let expected = (await selected.textContent())!.trim();
        await expect.poll(async () => (await ctx.page.locator(".revision-preview .identity .id").textContent())?.trim()).toBe(expected);
        await ctx.page.waitForTimeout(750);
        expect((await ctx.page.locator(".revision-preview .identity .id").textContent())?.trim()).toBe(expected);
    });

    it("navigates and searches a virtualized list of over 200 changed files", async () => {
        let bulk = join(ctx.tempDir, "bulk");
        mkdirSync(bulk, { recursive: true });
        for (let i = 0; i < 240; i++) writeFileSync(join(bulk, `item-${String(i).padStart(3, "0")}.txt`), `File ${i}\n`);
        await ctx.page.goto(backend);
        await ctx.page.locator(".graph .selection-item").first().click();
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("button", { name: "Choose changed file" }).click();
        let list = ctx.page.locator(".virtual-files");
        await list.waitFor();
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
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("file")).toBe("bulk/item-187.txt");
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("button", { name: "Choose changed file" }).click();
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("migration-step-00");
        await ctx.page.getByText("account-preferences-migration-step-00.txt", { exact: true }).click();
        let command = async () => {
            await ctx.page.getByRole("button", { name: "Commands", exact: true }).click();
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        let actions = ctx.page.locator(".hunk-actions");
        await actions.locator("summary").click();
        await actions.getByRole("option").first().click();
        let before = await getPaths();
        let openMove = async () => {
            await ctx.page.getByRole("button", { name: "Commands", exact: true }).click();
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
            await ctx.page.getByRole("button", { name: "Commands", exact: true }).click();
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("button", { name: "Details", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
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
        await ctx.page.getByRole("button", { name: "Commands", exact: true }).click();
        let commands = ctx.page.getByRole("dialog", { name: "Commands" });
        await commands.getByRole("textbox", { name: "Commands" }).fill("Refresh repository");
        await commands.getByRole("button", { name: /Refresh repository/ }).click();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspect")).toBe(after);
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
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
        let density = ctx.page.getByRole("combobox", { name: "History density" });
        let row = ctx.page.locator(".graph .selection-item").first();
        await row.waitFor();
        expect(await ctx.page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
        expect(await density.inputValue()).toBe("compact");
        let metrics = await row.evaluate(element => {
            let center = (rect: DOMRect) => rect.y + rect.height / 2;
            let bounds = element.getBoundingClientRect();
            let id = element.querySelector(".id")!.getBoundingClientRect();
            let description = element.querySelector(".desc")!.getBoundingClientRect();
            let node = element.closest("g")!.querySelector("circle")!.getBoundingClientRect();
            return { height: bounds.height, row: center(bounds), id: center(id), description: center(description), node: center(node) };
        });
        expect(metrics.height).toBe(32);
        expect(Math.abs(metrics.row - metrics.id)).toBeLessThanOrEqual(2);
        expect(Math.abs(metrics.row - metrics.description)).toBeLessThanOrEqual(2);
        expect(Math.abs(metrics.row - metrics.node)).toBeLessThanOrEqual(2);
        expect(await row.locator(".author").count()).toBe(0);
        let list = ctx.page.getByRole("listbox", { name: "Revision List" });
        await list.evaluate(element => { element.scrollTop = 320; });
        await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(320);
        let topLabel = () => list.evaluate(element => {
            let top = element.getBoundingClientRect().top;
            return [...element.querySelectorAll('.graph .selection-item')]
                .filter(row => row.getBoundingClientRect().bottom > top + 1)
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]?.getAttribute("aria-label");
        });
        let anchor = await topLabel();
        await density.selectOption("tall");
        await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(600);
        expect(await topLabel()).toBe(anchor);
        let tallMetrics = await row.evaluate(element => {
            let id = element.querySelector(".id")!.getBoundingClientRect();
            let description = element.querySelector(".desc")!.getBoundingClientRect();
            let author = element.querySelector(".author")!;
            return { height: element.getBoundingClientRect().height, id: id.y + id.height / 2, description: description.y + description.height / 2, authorTop: author.getBoundingClientRect().top, descriptionBottom: description.bottom, authorWeight: getComputedStyle(author).fontWeight, author: author.textContent };
        });
        expect(tallMetrics.height).toBe(60);
        expect(Math.abs(tallMetrics.id - tallMetrics.description)).toBeLessThanOrEqual(2);
        expect(tallMetrics.authorTop).toBeGreaterThanOrEqual(tallMetrics.descriptionBottom);
        expect(tallMetrics.authorWeight).toBe("400");
        expect(tallMetrics.author).toBeTruthy();
        await ctx.page.reload();
        await row.waitFor();
        expect(await density.inputValue()).toBe("tall");
        expect((await row.boundingBox())!.height).toBe(60);
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
            await page.getByRole("combobox", { name: "History density" }).selectOption("tall");
            await expect.poll(async () => (await row.boundingBox())?.height).toBe(60);
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
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.screenshot({ path: ".taste-skill/studio/quality/workspace-full.png" });
    });

});
