import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, PROJECT_ROOT, startGG, type TestContext } from "./harness";
import type { AnnotationThread } from "../app/messages/AnnotationThread";

let binary = join(PROJECT_ROOT, "target", "debug", process.platform === "win32" ? "gg.exe" : "gg");
describe("annotation CLI authoring", () => {
    let ctx: TestContext, url: string, env: NodeJS.ProcessEnv, originalConfig = process.env.XDG_CONFIG_HOME;
    function jj(...args: string[]) {
        return execFileSync("jj", ["--ignore-working-copy", "--repository", ctx.tempDir, ...args], { env, encoding: "utf8" });
    }
    function cli(args: string[], input?: string) {
        return execFileSync(binary, ["annotations", "-R", ctx.tempDir, ...args], { env, input, encoding: "utf8" });
    }
    beforeAll(async () => {
        ctx = await createContext(); extractTestRepo(ctx.tempDir);
        process.env.XDG_CONFIG_HOME = join(ctx.dataDir, "config");
        await mkdir(process.env.XDG_CONFIG_HOME, { recursive: true });
        env = { ...process.env, GG_DATA_DIR: ctx.dataDir };
        await writeFile(join(ctx.tempDir, "cli-note.txt"), "first\nsecond\n");
        execFileSync("jj", ["--repository", ctx.tempDir, "describe", "-m", "CLI parent"], { env });
        execFileSync("jj", ["--repository", ctx.tempDir, "new", "-m", "CLI child"], { env });
        await writeFile(join(ctx.tempDir, "cli-note.txt"), "first\nchanged\n");
        execFileSync("jj", ["--repository", ctx.tempDir, "status"], { env });
        url = await startGG(ctx);
    });
    afterAll(async () => {
        if (originalConfig === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = originalConfig;
        if (ctx) await destroyContext(ctx);
    });
    it("creates exact new/old line targets, edits own posts and leaves repository history untouched", async () => {
        await writeFile(join(ctx.tempDir, "cli-note.txt"), "first\nunsnapshotted\n");
        let operation = jj("op", "log", "--no-graph", "--limit", "1", "--template", "id");
        let created: AnnotationThread = JSON.parse(cli(["create", "--file", "cli-note.txt", "--lines", "1-2", "--agent", "review-bot", "--json"], "Please review these lines"));
        expect(created.targets[0].anchor).toMatchObject({ kind: "lines", path: "cli-note.txt", side: "new", start: 1, end: 2, quote: "first\nchanged" });
        let old: AnnotationThread = JSON.parse(cli(["create", "Old lines", "--file", "cli-note.txt", "--lines", "2", "--side", "old", "--json"]));
        expect(old.targets[0].anchor).toMatchObject({ kind: "lines", side: "old", quote: "second" });
        let bookmark: AnnotationThread = JSON.parse(cli(["create", "Bookmark note", "--bookmark", "main", "--json"]));
        expect(bookmark.targets[0].anchor).toMatchObject({ kind: "bookmark", name: "main" });
        let changed: AnnotationThread = JSON.parse(cli(["edit", created.id.slice(0, 10), "Updated opening", "--agent", "review-bot", "--json"]));
        expect(changed.id).toBe(created.id);
        expect(changed.targets[0].anchor).toEqual(created.targets[0].anchor);
        expect(changed.posts[0].body).toBe("Updated opening");
        let replied: AnnotationThread = JSON.parse(cli(["reply", created.id, "A reply", "--agent", "other-bot", "--model", "test-model", "--json"]));
        let reply = replied.posts[1];
        let editedReply: AnnotationThread = JSON.parse(cli(["edit", created.id, "Edited reply", "--post", reply.id.slice(0, 10), "--agent", "other-bot", "--json"]));
        expect(editedReply.posts[1].metadata).toEqual(reply.metadata);
        expect(editedReply.posts[1].body).toBe("Edited reply");
        expect(() => cli(["edit", created.id, "Wrong author", "--agent", "other-bot"])).toThrow();
        let before = JSON.parse(cli(["list", "--json"])).length;
        expect(() => cli(["create", "Bad lines", "--file", "cli-note.txt", "--lines", "0-8"])).toThrow();
        expect(() => cli(["create", "Too many", "--revision", "all()"])).toThrow();
        expect(JSON.parse(cli(["list", "--json"]))).toHaveLength(before);
        expect(jj("op", "log", "--no-graph", "--limit", "1", "--template", "id")).toBe(operation);
        await ctx.page.goto(url);
        await ctx.page.evaluate(() => {
            let group = (active: string) => ({ type: "tabs", active, panels: [active] });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "annotations", root: { type: "split", direction: "row", ratio: .35, first: group("timeline"), second: group("annotations") } }));
        });
        await ctx.page.reload();
        await ctx.page.getByRole("list", { name: "Notes" }).getByRole("button", { name: /Updated opening/ }).click();
        await ctx.page.getByText("Edited reply", { exact: true }).waitFor();
        expect(await ctx.page.getByLabel("Annotated code").textContent()).toBe("first\nchanged");
    });
});
