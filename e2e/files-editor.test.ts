import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("editor view", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
    });
    afterEach(async () => { await destroyContext(ctx); });

    async function openEditor(page: Page) {
        await page.getByRole("button", { name: "Views", exact: true }).click();
        await page.getByRole("menuitemcheckbox", { name: "Editor", exact: true }).click();
        let tree = page.getByRole("tree", { name: "Repository files" });
        await tree.waitFor();
        await tree.getByRole("treeitem").first().waitFor();
        return tree;
    }

    it("edits and saves a working copy file, and the diff shows it", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        // the first row is the working copy
        await page.locator(".graph .selection-item").nth(0).click();
        let tree = await openEditor(page);
        await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();

        let editor = page.getByRole("textbox", { name: /Contents of a\.txt/ });
        await editor.waitFor();
        let bar = page.locator(".editor-bar");
        await expect.poll(() => bar.textContent()).toContain("Working copy");

        await editor.click();
        await page.keyboard.press("Control+Home");
        await page.keyboard.type("typed in the editor\n");
        await expect.poll(() => bar.textContent()).toContain("Unsaved");
        await page.keyboard.press("Control+s");
        await expect.poll(() => bar.textContent()).not.toContain("Unsaved");

        // the editor keeps the file open through the refresh that follows the save
        await expect.poll(() => page.getByRole("textbox", { name: /Contents of a\.txt/ }).isVisible()).toBe(true);
        // the default layout shows the Diff view beside the opened Editor view
        let diff = page.locator("[data-panel-group=diff]");
        await expect.poll(() => diff.locator("diffs-container").first().evaluate(node => node.shadowRoot?.textContent ?? "").catch(() => "")).toContain("typed in the editor");
    });

    it("keeps showing the working copy's files, editable, when an older revision is selected", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        await page.locator(".graph .selection-item").nth(1).click();
        let tree = await openEditor(page);
        // d.txt exists only in the working copy: main renamed c.txt to d.txt
        await tree.getByRole("treeitem", { name: "d.txt", exact: true }).waitFor();
        await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();

        let bar = page.locator(".editor-bar");
        await expect.poll(() => bar.textContent()).toContain("Working copy");
        expect(await bar.textContent()).not.toContain("Read only");
        expect(await page.getByRole("textbox", { name: /Contents of a\.txt/ }).getAttribute("aria-readonly")).not.toBe("true");
        // the timeline selection stays where the user put it
        expect(await page.locator(".graph .selection-item").nth(1).getAttribute("aria-selected")).toBe("true");
    });

    it("opens the diff of a changed file for the working copy", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        await page.locator(".graph .selection-item").nth(0).click();
        let tree = await openEditor(page);
        await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();
        let editor = page.getByRole("textbox", { name: /Contents of a\.txt/ });
        await editor.waitFor();
        await editor.click();
        await page.keyboard.press("Control+Home");
        await page.keyboard.type("diff me\n");
        await page.keyboard.press("Control+s");
        let bar = page.locator(".editor-bar");
        await expect.poll(() => bar.textContent()).not.toContain("Unsaved");

        // look at an older revision, then ask the editor for the diff of its file
        await page.locator(".graph .selection-item").nth(1).click();
        await expect.poll(() => page.locator(".graph .selection-item").nth(1).getAttribute("aria-selected")).toBe("true");
        await page.getByRole("button", { name: "Open diff", exact: true }).click();

        await expect.poll(() => page.locator(".graph .selection-item").nth(0).getAttribute("aria-selected")).toBe("true");
        let diff = page.locator("[data-panel-group=diff]");
        await expect.poll(() => diff.locator("diffs-container").first().evaluate(node => node.shadowRoot?.textContent ?? "").catch(() => "")).toContain("diff me");
    });

    it("annotates a line from the editor's own context menu", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        let tree = await openEditor(page);
        await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();
        let editor = page.getByRole("textbox", { name: /Contents of a\.txt/ });
        await editor.waitFor();

        await page.locator(".cm-line").first().click({ button: "right" });
        let menu = page.getByRole("menu");
        await menu.waitFor();
        expect(await menu.getByRole("menuitem", { name: "Annotate line…", exact: true }).count()).toBe(1);
        expect(await menu.getByRole("menuitem", { name: "Select all" }).count()).toBe(1);
        await menu.getByRole("menuitem", { name: "Annotate line…", exact: true }).click();

        await page.getByRole("textbox", { name: "Note", exact: true }).fill("Why is this the first line?");
        await page.getByRole("button", { name: "Save note", exact: true }).click();

        let notes = page.getByRole("list", { name: "Notes", exact: true });
        await expect.poll(() => notes.locator("li").count()).toBe(1);
        expect(await notes.textContent()).toContain("Why is this the first line?");
        // anchored to the file and its first line
        expect(await notes.textContent()).toContain("a.txt:1");
    });
});
