import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("scattered repository actions", () => {
    let ctx: TestContext, url: string;
    beforeEach(async () => { ctx = await createContext(); extractTestRepo(ctx.tempDir); url = await startGG(ctx); });
    afterEach(async () => { if (ctx) await destroyContext(ctx); });
    function jj(...args: string[]) { return execFileSync("jj", ["--ignore-working-copy", "-R", ctx.tempDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
    async function picks() {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(url);
        let rows = page.locator(".graph .selection-item");
        await rows.filter({ hasText: "small file child" }).first().click();
        await rows.filter({ hasText: "hunk grandchild" }).first().click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
        await rows.filter({ hasText: "small file child" }).first().click({ button: "right" });
        return page.getByRole("menu");
    }
    it("abandons only the confirmed selection and undoes it as one operation", async () => {
        let menu = await picks(), page = ctx.page;
        await menu.getByRole("menuitem", { name: "Abandon selected…", exact: true }).click();
        let dialog = page.getByRole("dialog", { name: "Abandon selected?", exact: true });
        await dialog.waitFor();
        await dialog.locator("#dialog-commands").getByRole("button", { name: "Cancel", exact: true }).click();
        expect(jj("log", "-r", "vnstymnv | onsonsrz", "--no-graph", "-T", 'description.first_line() ++ "\\n"')).toContain("hunk grandchild");
        await page.locator(".graph .selection-item").filter({ hasText: "small file child" }).first().click({ button: "right" });
        await page.getByRole("menuitem", { name: "Abandon selected…", exact: true }).click();
        await dialog.waitFor();
        expect(await dialog.textContent()).toContain("2 selected changes");
        expect(await dialog.textContent()).toContain("unselected descendants remain");
        expect(await dialog.textContent()).toContain("small file child");
        expect(await dialog.textContent()).toContain("hunk grandchild");
        mkdirSync("e2e/results/scattered-actions", { recursive: true });
        await page.screenshot({ path: "e2e/results/scattered-actions/abandon-confirmation.png" });
        await dialog.getByRole("combobox", { name: "Action", exact: true }).selectOption("Abandon selected");
        await dialog.getByRole("button", { name: "Enter", exact: true }).click();
        await expect.poll(() => jj("log", "-r", "present(vnstymnv) | present(onsonsrz)", "--no-graph", "-T", "change_id")).toBe("");
        expect(jj("log", "-r", "rwpmyumq | uqpmkpqu", "--no-graph", "-T", 'description.first_line() ++ "\\n"')).toContain("small file parent");
        await page.getByRole("button", { name: "Undo the latest operation", exact: true }).click();
        await expect.poll(() => jj("log", "-r", "present(vnstymnv) | present(onsonsrz)", "--no-graph", "-T", 'description.first_line() ++ "\\n"')).toContain("hunk grandchild");
    });
    it("rebases each selected change onto the chosen parent", async () => {
        let menu = await picks(), page = ctx.page;
        await menu.getByRole("menuitem", { name: "Rebase each onto…", exact: true }).click();
        let picker = page.getByRole("dialog", { name: "Rebase each selected change onto", exact: true });
        await picker.getByRole("textbox", { name: "Bookmark or revset" }).fill("wnpusytq");
        await picker.getByRole("button", { name: "Use", exact: true }).click();
        let dialog = page.getByRole("dialog", { name: "Rebase each?", exact: true });
        await dialog.waitFor();
        expect(await dialog.textContent()).toContain("separate child");
        await page.screenshot({ path: "e2e/results/scattered-actions/rebase-confirmation.png" });
        await dialog.getByRole("combobox", { name: "Action", exact: true }).selectOption("Rebase each");
        await dialog.getByRole("button", { name: "Enter", exact: true }).click();
        let destination = jj("log", "-r", "wnpusytq", "--no-graph", "-T", "commit_id");
        for (let source of ["vnstymnv", "onsonsrz"]) await expect.poll(() => jj("log", "-r", `${source}-`, "--no-graph", "-T", "commit_id")).toBe(destination);
        expect(jj("log", "-r", "rwpmyumq", "--no-graph", "-T", "description.first_line()")).toBe("hunk child single");
    });
});
