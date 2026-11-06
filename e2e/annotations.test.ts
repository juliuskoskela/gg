import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { createContext, destroyContext, extractTestRepo, PROJECT_ROOT, startGG, type TestContext } from "./harness";

const GG = join(PROJECT_ROOT, "target", "debug", process.platform === "win32" ? "gg.exe" : "gg");

describe("annotations", () => {
    let ctx: TestContext;
    let url: string;
    let cli = (...args: string[]) => execFileSync(GG, ["annotations", "-R", ctx.tempDir, ...args], { env: { ...process.env, GG_DATA_DIR: ctx.dataDir }, encoding: "utf8" });

    beforeAll(async () => {
        await mkdir("e2e/results/annotations", { recursive: true });
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
        await ctx.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("notes a change, takes an agent's reply from the command line and copies both for a conversation", async () => {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url);
        await page.evaluate(() => {
            let group = (active: string, panels = [active]) => ({ type: "tabs", active, panels });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "annotations", root: { type: "split", direction: "row", ratio: .4, first: group("timeline"), second: group("annotations", ["description", "annotations"]) } }));
        });
        await page.reload();
        await page.getByText("No notes yet").waitFor();

        await page.locator(".graph .selection-item").filter({ hasText: "rename c.txt" }).first().click({ button: "right" });
        await page.getByRole("menuitem", { name: "Annotate change…" }).click();
        await page.getByRole("textbox", { name: "Note" }).fill("Why does this rename **drop** the old path?");
        await page.getByRole("button", { name: "Preview" }).click();
        expect(await page.getByRole("region", { name: "Preview" }).locator("strong").textContent()).toBe("drop");
        await page.getByRole("button", { name: "Save note" }).click();

        let notes = page.getByRole("list", { name: "Notes" });
        await expect.poll(() => notes.locator("li").count()).toBe(1);
        expect(await notes.textContent()).toContain("Why does this rename drop the old path?");
        await expect.poll(() => page.getByRole("tab", { name: "Annotations" }).textContent()).toContain("1");

        // the note lives outside the repository, keyed by jj's repository id
        let repos = readdirSync(join(ctx.dataDir, "repos"));
        expect(repos).toHaveLength(1);
        expect(readdirSync(join(ctx.tempDir)).some(name => name.startsWith(".gg"))).toBe(false);

        let listed = JSON.parse(cli("list", "--json"));
        expect(listed).toHaveLength(1);
        expect(listed[0].anchor).toMatchObject({ kind: "revision" });
        cli("reply", listed[0].id.slice(0, 8), "--agent", "claude", "The old path is removed in the same change.");

        // the open view picks up replies written elsewhere
        await page.getByText("The old path is removed in the same change.").waitFor({ timeout: 10000 });
        expect(await page.getByText("Agent", { exact: true }).count()).toBe(1);
        await page.screenshot({ path: "e2e/results/annotations/thread-1440.png" });

        await page.getByRole("checkbox", { name: "Select all notes" }).check();
        await page.getByRole("button", { name: "Copy selected" }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("gg annotations reply");
        let copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain("Why does this rename **drop** the old path?");
        expect(copied).toContain("Reply from claude (agent):");
        expect(cli("export")).toBe(copied);

        await page.getByRole("button", { name: "Resolve" }).click();
        await page.getByText("No open notes").waitFor();
        expect(cli("list")).toContain("No open notes");
        expect(cli("list", "--all")).toContain("resolved");
    });

    it("keeps the annotated lines with a note made in the diff", async () => {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => {
            let group = (active: string, panels = [active]) => ({ type: "tabs", active, panels });
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, compactActive: "diff", root: { type: "split", direction: "row", ratio: .4, first: group("timeline"), second: { type: "split", direction: "column", ratio: .5, first: group("annotations"), second: group("diff") } } }));
        });
        await page.reload();
        await page.locator(".graph .selection-item").filter({ hasText: "hunk child multi" }).click();
        let line = page.locator(".diff-content [data-line]").first();
        await line.waitFor();
        let box = (await line.boundingBox())!;
        await page.mouse.click(box.x + 40, box.y + box.height / 2, { button: "right" });
        await page.getByRole("menuitem", { name: /Annotate line 1/ }).click();
        expect(await page.getByLabel("Annotated code").textContent()).toBe("line1");
        await page.getByRole("textbox", { name: "Note" }).fill("Start here");
        await page.keyboard.press("Control+Enter");
        await page.getByRole("list", { name: "Notes" }).getByText("Start here").waitFor();
        await page.screenshot({ path: "e2e/results/annotations/lines-1440.png" });
        let note = JSON.parse(cli("list", "--json"))[0];
        expect(note.anchor).toMatchObject({ kind: "lines", path: "hunk_test.txt", start: 1, end: 1, quote: "line1" });
        expect(cli("show", note.id)).toContain("```txt\nline1\n```");
    });
});
