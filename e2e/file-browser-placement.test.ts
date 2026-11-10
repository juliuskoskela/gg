import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, openChangedFiles, startGG, type TestContext } from "./harness";

type Box = { x: number; y: number; width: number; height: number };

describe("file browser placement", () => {
    let ctx: TestContext;

    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await mkdir(join(ctx.tempDir, "folder"));
        await writeFile(join(ctx.tempDir, "folder/a.txt"), "first added file\n");
        await writeFile(join(ctx.tempDir, "folder/b.txt"), "second added file\n");
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
    });
    afterEach(async () => destroyContext(ctx));

    let box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox()) as Box;
    let chooseSide = async (page: Page, label: string, side: string) => {
        let trigger = page.getByRole("button", { name: label, exact: true });
        if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
        await page.getByRole("menuitemradio", { name: side, exact: true }).click();
    };

    it("places the changed files pane on each side of the diff, with the file bar under the content", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        await page.locator(".graph .selection-item").first().click();
        let drawer = await openChangedFiles(ctx.page);
        let sides = { Left: "left", Right: "right", Top: "top", Bottom: "bottom" } as const;
        for (let [name, side] of Object.entries(sides)) {
            await chooseSide(page, "Changed files layout", name);
            await expect.poll(() => page.locator(`.changes-layout .browser.${side}`).count()).toBe(1);
            await drawer.locator("aside").waitFor();
            let pane = await box(page, "#changed-files-drawer");
            let diff = await box(page, ".changes-layout .diff-scroll");
            let bar = await box(page, ".changes-layout .panel-footer");
            let header = await box(page, 'button[aria-label="Changed files layout"]');
            // the file bar always sits directly under the diff, whatever side the pane is on
            expect(Math.abs(bar.y - (diff.y + diff.height))).toBeLessThanOrEqual(1);
            expect(Math.abs(bar.x - diff.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(bar.width - diff.width)).toBeLessThanOrEqual(1);
            if (side === "left") expect(pane.x + pane.width).toBeLessThanOrEqual(diff.x + 1);
            if (side === "right") expect(pane.x).toBeGreaterThanOrEqual(diff.x + diff.width - 1);
            if (side === "top") {
                expect(pane.y + pane.height).toBeLessThanOrEqual(diff.y + 1);
                expect(pane.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
            }
            if (side === "bottom") expect(pane.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
            if (side === "left" || side === "right") {
                // beside the content, the pane runs the whole height of the diff module below the header
                expect(Math.abs(pane.height - (bar.y + bar.height - diff.y))).toBeLessThanOrEqual(1);
            }
            let toggle = page.getByRole("button", { name: "Hide changed files" });
            expect(await toggle.getAttribute("aria-controls")).toBe("changed-files-drawer");
            expect(await toggle.getAttribute("aria-expanded")).toBe("true");
            expect(JSON.parse(await page.evaluate(() => localStorage.getItem("gg.diff.files")!)).side).toBe(side);
        }
    });

    it("keeps the diff placement after a reload and hides the pane from the menu", async () => {
        let page = ctx.page;
        let url = await startGG(ctx);
        await page.goto(url);
        await page.locator(".graph .selection-item").first().click();
        await openChangedFiles(page);
        await chooseSide(page, "Changed files layout", "Right");
        await page.reload();
        await page.locator(".graph .selection-item").first().click();
        await expect.poll(() => page.locator(".changes-layout .browser.right").count()).toBe(1);
        let trigger = page.getByRole("button", { name: "Changed files layout", exact: true });
        await trigger.click();
        await page.getByRole("menuitemcheckbox", { name: "Changed files", exact: true }).click();
        await expect.poll(() => page.getByRole("button", { name: "Show changed files" }).count()).toBe(1);
        // the pane animates shut before it unmounts
        await expect.poll(() => page.getByRole("tree", { name: "Changed files" }).count()).toBe(0);
    });

    it("places the Editor tree above and below the editor", async () => {
        let page = ctx.page;
        await page.goto(await startGG(ctx));
        await page.locator(".graph .selection-item").first().click();
        await page.getByRole("button", { name: "Views", exact: true }).click();
        await page.getByRole("menuitemcheckbox", { name: "Editor", exact: true }).click();
        // beside the other views the Editor is narrower than 560px, where it turns into two pages
        await page.getByRole("button", { name: "Views", exact: true }).click();
        for (let view of ["Timeline", "Description", "Diff"]) await page.getByRole("menuitemcheckbox", { name: view, exact: true }).click();
        await page.keyboard.press("Escape");
        let tree = page.getByRole("tree", { name: "Repository files" });
        await tree.getByRole("treeitem").first().waitFor();
        await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();
        await page.getByRole("textbox", { name: /Contents of a\.txt/ }).waitFor();
        let view = ".files-view";
        for (let [name, side] of [["Top", "top"], ["Bottom", "bottom"], ["Right", "right"], ["Left", "left"]] as const) {
            await chooseSide(page, "Editor layout", name);
            await expect.poll(() => page.locator(`${view} .browser.${side}`).count()).toBe(1);
            let pane = await box(page, `${view} .browser > .pane`);
            let editor = await box(page, `${view} .editor-pane`);
            let paneBar = await box(page, `${view} .tree-pane .pane-bar`);
            expect(Math.abs(paneBar.y - pane.y)).toBeLessThanOrEqual(1);
            if (side === "top") expect(pane.y + pane.height).toBeLessThanOrEqual(editor.y + 1);
            if (side === "bottom") expect(pane.y).toBeGreaterThanOrEqual(editor.y + editor.height - 1);
            if (side === "left") expect(pane.x + pane.width).toBeLessThanOrEqual(editor.x + 1);
            if (side === "right") expect(pane.x).toBeGreaterThanOrEqual(editor.x + editor.width - 1);
            // the open file survives every move
            expect(await page.getByRole("textbox", { name: /Contents of a\.txt/ }).isVisible()).toBe(true);
        }
    });
});
