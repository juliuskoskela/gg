import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("workspace startup selection", () => {
    let ctx: TestContext;
    let url: string;
    let workingChange: string;
    let newestChange: string;
    let nextPages = 0;
    function jj(...args: string[]) {
        return execFileSync("jj", ["--repository", ctx.tempDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    }
    function selected() { return ctx.page.locator(".graph .selected .desc"); }

    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        jj("config", "set", "--repo", "revsets.log", "all()");
        jj("config", "set", "--repo", "gg.queries.log-page-size", "2");
        jj("describe", "-m", "Startup working copy");
        workingChange = jj("log", "-r", "@", "--no-graph", "-T", "change_id");
        for (let index = 0; index < 18; index++) jj("new", "-m", `startup newer ${index}`);
        newestChange = jj("log", "-r", "@", "--no-graph", "-T", "change_id");
        url = await startGG(ctx);
        await ctx.page.setViewportSize({ width: 1440, height: 720 });
        await ctx.page.goto(url);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("restarts on the current working copy, past the first log page, and scrolls it into view", async () => {
        await expect.poll(async () => (await selected().textContent())?.trim()).toBe("startup newer 17");
        let exited = once(ctx.ggProcess!, "exit");
        ctx.ggProcess!.kill();
        await exited;
        ctx.ggProcess = null;
        jj("edit", workingChange);
        url = await startGG(ctx);
        ctx.page.on("request", request => { if (request.url().endsWith("/query_log_next_page")) nextPages++; });
        await ctx.page.goto(url);
        await expect.poll(async () => (await selected().textContent())?.trim()).toBe("Startup working copy");
        expect(nextPages).toBeGreaterThan(0);
        await expect.poll(async () => {
            let row = await selected().boundingBox();
            let list = await ctx.page.locator(".graph-body .listbox").boundingBox();
            return !!row && !!list && row.y >= list.y && row.y + row.height <= list.y + list.height;
        }).toBe(true);
    });

    it("keeps the working copy selected when the saved log filter excludes it", async () => {
        let input = ctx.page.locator(".log-selector input");
        await input.fill('description("startup newer")');
        await input.press("Enter");
        await expect.poll(() => selected().count()).toBe(0);
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("Startup working copy");
        await ctx.page.reload();
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("Startup working copy");
        expect(await selected().count()).toBe(0);
    });

    it("honours an explicit revision link", async () => {
        await ctx.page.goto(`${url}/?inspect=${newestChange}`);
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("startup newer 17");
    });
});
