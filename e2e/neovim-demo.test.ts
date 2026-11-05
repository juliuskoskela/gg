import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { NeovimGrid } from "../app/editor/grid";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createContext, destroyContext, extractTestRepo, startGG, PROJECT_ROOT, type TestContext } from "./harness";

let available = ["nvim", "jj"].every(command => spawnSync(command, ["--version"]).status === 0);
describe.skipIf(!available)("Neovim development demo", () => {
    let ctx: TestContext;
    let server: ViteDevServer;
    let url: string;
    let original = process.env.GG_NEOVIM_DEMO;
    let originalRepo = process.env.GG_NEOVIM_REPOSITORY;
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        writeFileSync(join(ctx.tempDir, "Demo.svelte"), '<script lang="ts">\n    export let message: string = "Highlighted Svelte";\n</script>\n<h1>{message}</h1>\n<style>\n    h1 { color: red; }\n</style>\n');
        execFileSync("jj", ["describe", "-m", "Neovim Svelte fixture"], { cwd: ctx.tempDir });
        let backend = await startGG(ctx);
        process.env.GG_NEOVIM_DEMO = "1";
        process.env.GG_NEOVIM_REPOSITORY = ctx.tempDir;
        server = await createServer({ configFile: `${PROJECT_ROOT}/vite.config.ts`, server: { host: "127.0.0.1", port: 0, strictPort: false, proxy: { "/api": { target: backend } } } });
        await server.listen();
        let address = server.httpServer!.address() as { port: number };
        url = `http://127.0.0.1:${address.port}`;
    });
    afterAll(async () => {
        if (ctx) await destroyContext(ctx);
        await server?.close();
        if (original === undefined) delete process.env.GG_NEOVIM_DEMO; else process.env.GG_NEOVIM_DEMO = original;
        if (originalRepo === undefined) delete process.env.GG_NEOVIM_REPOSITORY; else process.env.GG_NEOVIM_REPOSITORY = originalRepo;
    });
    it("edits a real Neovim scratch buffer, undoes, and retains it across reader modes without modifying the repository", async () => {
        let commit = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "main", "--no-graph", "-T", "commit_id"], { cwd: ctx.tempDir, encoding: "utf8" }).trim();
        let diskBefore = readFileSync(join(ctx.tempDir, "d.txt"), "utf8");
        let before = execFileSync("jj", ["--ignore-working-copy", "file", "show", "-r", commit, "root-file:d.txt"], { cwd: ctx.tempDir, encoding: "utf8" });
        await ctx.page.goto(`${url}/?inspect=${commit}&file=d.txt`);
        await ctx.page.getByRole("button", { name: "File", exact: true }).click();
        let screen = ctx.page.locator(".screen-text");
        await ctx.page.getByRole("textbox", { name: "Neovim scratch editor" }).waitFor();
        await expect.poll(() => screen.textContent()).toContain(before.trim().split("\n")[0]);
        let input = ctx.page.getByRole("textbox", { name: "Neovim scratch editor" });
        await ctx.page.locator(".editor canvas").click({ position: { x: 60, y: 30 }, timeout: 3000 });
        await expect.poll(() => input.evaluate(node => node === document.activeElement)).toBe(true);
        await ctx.page.keyboard.type("ggIgg-demo-proof ");
        await ctx.page.keyboard.press("Escape");
        await expect.poll(() => screen.textContent()).toContain("gg-demo-proof");
        await ctx.page.keyboard.type("u");
        await expect.poll(() => screen.textContent()).not.toContain("gg-demo-proof");
        await ctx.page.keyboard.type("Iretained-buffer ");
        await ctx.page.keyboard.press("Escape");
        await ctx.page.getByRole("button", { name: "Diff", exact: true }).click();
        await ctx.page.getByRole("button", { name: "File", exact: true }).click();
        await expect.poll(() => screen.textContent()).toContain("retained-buffer");
        expect(execFileSync("jj", ["--ignore-working-copy", "file", "show", "-r", commit, "root-file:d.txt"], { cwd: ctx.tempDir, encoding: "utf8" })).toBe(before);
        expect(readFileSync(join(ctx.tempDir, "d.txt"), "utf8")).toBe(diskBefore);
        expect(await ctx.page.locator("canvas").evaluate(node => !!(node as HTMLCanvasElement).getContext("webgl2"))).toBe(true);
    });
    it("loads Svelte, embedded TypeScript and CSS syntax and accepts click-to-type input", async () => {
        let grid = new NeovimGrid();
        let language = "";
        let warnings: string[] = [];
        ctx.page.on("websocket", socket => socket.on("framereceived", event => {
            try {
                let message = JSON.parse(String(event.payload));
                if (message.type === "redraw") grid.apply(message.events);
                if (message.type === "opened") { language = message.syntax; if (message.warning) warnings.push(message.warning); }
                if (message.type === "error") warnings.push(message.message);
            } catch { /* Vite also has a websocket */ }
        }));
        await ctx.page.goto(`${url}/?inspect=@&file=Demo.svelte`);
        await ctx.page.getByRole("button", { name: "File", exact: true }).click();
        await expect.poll(() => language).toBe("svelte");
        let screen = ctx.page.locator(".screen-text");
        await expect.poll(() => screen.textContent()).toContain("Highlighted Svelte");
        await expect.poll(() => grid.rows.some(row => row.slice(4).some(cell => cell.text.trim() && grid.highlights.get(cell.hl)?.foreground !== undefined && grid.highlights.get(cell.hl)?.foreground !== grid.foreground))).toBe(true);
        await ctx.page.locator(".editor canvas").click({ position: { x: 75, y: 30 } });
        await ctx.page.keyboard.type("ggI<!-- native-click-proof -->");
        await ctx.page.keyboard.press("Escape");
        await expect.poll(() => screen.textContent()).toContain("native-click-proof");
        expect(warnings).toEqual([]);
    });

});
