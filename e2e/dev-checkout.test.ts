import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, loadConfigFromFile, type ViteDevServer } from "vite";
import { createContext, destroyContext, extractTestRepo, PROJECT_ROOT, startGG, type TestContext } from "./harness.js";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RepoStatus } from "../app/messages/RepoStatus";
import type { RevsResult } from "../app/messages/RevsResult";
import type { MutationResult } from "../app/messages/MutationResult";

describe("self-hosted development checkout", () => {
    let ctx: TestContext;
    let server: ViteDevServer | undefined;

    beforeEach(async () => { ctx = await createContext(); });
    afterEach(async () => {
        await ctx.page?.close();
        await server?.close();
        server = undefined;
        await destroyContext(ctx);
    });

    it("keeps a coherent frontend when Edit and Undo rewrite the running app's source", async () => {
        extractTestRepo(ctx.tempDir);
        await cp(join(PROJECT_ROOT, "app"), join(ctx.tempDir, "app"), { recursive: true });
        for (let file of ["index.html", "package.json", ".gitignore"]) {
            await cp(join(PROJECT_ROOT, file), join(ctx.tempDir, file));
        }
        await symlink(join(PROJECT_ROOT, "node_modules"), join(ctx.tempDir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
        await writeFile(join(ctx.tempDir, ".gitignore"), "\n/.vite-cache/\n", { flag: "a" });
        // changing an exported store and its consumers together reproduces stale HMR imports.
        let files = ["app/App.svelte", "app/stores.ts", "app/RevisionPane.svelte", "app/shell/WorkspacePanelControls.svelte", "app/shell/FilesToggle.svelte"];
        let current = await Promise.all(files.map(async file => ({ file, source: await readFile(join(ctx.tempDir, file), "utf8") })));
        for (let { file, source } of current) {
            let previous = source.replace(/mobileFilesVisible/g, "previousFilesVisible");
            if (file.endsWith("App.svelte")) {
                previous = previous.replace(/<WorkspacePanelControls\b[\s\S]*?<\/WorkspacePanelControls>/, "").replace('<div class="workspace-view"', '<div data-source-generation="earlier" class="workspace-view"');
            }
            if (file.endsWith("RevisionPane.svelte")) previous = previous.replace('{#if !integrated}<header', '<header data-integrated={integrated}').replace('</header>{/if}', '</header>');
            if (file.endsWith("WorkspacePanelControls.svelte")) previous = previous.replace('<header ', '<header data-revision-available={revisionAvailable} ');
            previous = previous.replace(/\s*import FilesToggle from [^;]+;/, "").replace(/<FilesToggle\b[^>]*\/>/g, "");
            if (file.endsWith("FilesToggle.svelte")) await rm(join(ctx.tempDir, file));
            else await writeFile(join(ctx.tempDir, file), previous);
        }
        let backend = await startGG(ctx);
        async function request<T>(endpoint: string, args: Record<string, unknown> = {}): Promise<T> {
            let response = await fetch(`${backend}/api/${endpoint}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...args, client_id: "dev-checkout-fixture" }),
            });
            expect(response.ok).toBe(true);
            return response.json();
        }
        let workspace = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (workspace.type !== "Workspace") throw new Error("Could not open the source fixture");
        let status = await request<RepoStatus | null>("query/query_snapshot") ?? workspace.status;
        let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: status.working_copy };
        let earlier = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
        if (earlier.type !== "Detail") throw new Error("Could not snapshot the earlier frontend");
        let oldId = earlier.headers[0].id;
        let created = await request<MutationResult>("mutate/create_revision", {
            mutation: { set: { from: oldId, to: oldId } }, options: { ignore_immutable: false },
        });
        expect(created.type).toBe("Updated");
        for (let { file, source } of current) {
            if (file.endsWith("App.svelte")) source = source.replace('<div class="workspace-view"', '<div data-source-generation="current" class="workspace-view"');
            await writeFile(join(ctx.tempDir, file), source);
        }
        await request("query/query_snapshot");
        let loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, join(PROJECT_ROOT, "vite.config.ts"));
        if (!loaded) throw new Error("Could not load the development configuration");
        server = await createServer({
            ...loaded.config,
            configFile: false,
            root: ctx.tempDir,
            cacheDir: join(ctx.tempDir, ".vite-cache"),
            server: {
                ...loaded.config.server,
                host: "127.0.0.1", port: 0, strictPort: false,
                fs: { allow: [PROJECT_ROOT, ctx.tempDir] },
                proxy: { "/api": backend },
            },
        });
        await server.listen();
        let errors: string[] = [];
        ctx.page.on("pageerror", error => errors.push(error.message));
        await ctx.page.setViewportSize({ width: 1440, height: 900 });
        await ctx.page.goto(server.resolvedUrls!.local[0]);
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill(oldId.commit.hex);
        await filter.press("Tab");
        await ctx.page.locator('.graph [id^="Revision-"]').first().click();
        let header = ctx.page.locator(".workspace-panels");
        function generation() {
            return ctx.page.evaluate(() => document.querySelector(".workspace-view")?.getAttribute("data-source-generation"));
        }
        await expect.poll(generation).toBe("current");

        for (let cycle = 0; cycle < 2; cycle++) {
            await expect.poll(() => ctx.page.locator(".workspace-panels .revision-id").textContent()).toContain(oldId.change.hex.slice(0, 8));
            await ctx.page.waitForLoadState("networkidle");
            let actions = ctx.page.getByRole("button", { name: "Revision actions", exact: true });
            await actions.click();
            let edit = ctx.page.getByRole("button", { name: /^Edit as working copy/ });
            await expect.poll(() => edit.isEnabled()).toBe(true);
            let checkout = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/checkout_revision"));
            await edit.click();
            expect((await checkout).ok()).toBe(true);
            await expect.poll(generation, { timeout: 10000 }).toBe("earlier");
            let response = ctx.page.waitForResponse(result => result.url().includes("/api/mutate/undo_operation"));
            await ctx.page.getByRole("button", { name: "Undo the latest operation", exact: true }).click();
            expect((await response).ok()).toBe(true);
            await expect.poll(generation, { timeout: 10000 }).toBe("current");
            let bounds = (await header.boundingBox())!;
            expect(bounds.height).toBe(40);
            expect((await ctx.page.locator(".two-pane").boundingBox())!.y).toBe(bounds.y + bounds.height);
            expect(await ctx.page.locator('button:not([role="separator"])[aria-controls="changed-files"]').count()).toBe(1);
            expect(errors).toEqual([]);
        }
        let mountedAt = await ctx.page.evaluate(() => performance.timeOrigin);
        await writeFile(join(ctx.tempDir, "app/global.css"), "\n:root { --dev-checkout-probe: ready; }\n", { flag: "a" });
        await expect.poll(() => ctx.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dev-checkout-probe").trim())).toBe("ready");
        expect(await ctx.page.evaluate(() => performance.timeOrigin)).toBe(mountedAt);
    });
});
