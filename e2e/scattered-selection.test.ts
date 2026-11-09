import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("scattered timeline selection", () => {
    let ctx: TestContext;
    let url: string;

    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    it("picks revisions one by one with Ctrl, offers only what works on any set, and returns to ranges", async () => {
        let page = ctx.page;
        let modifier = process.platform === "darwin" ? "Meta" : "Control";
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url);
        let rows = page.locator(".graph .selection-item");
        let row = (text: string) => rows.filter({ hasText: text }).first();
        let selected = () => page.locator(".graph .selected .desc").allTextContents().then(texts => texts.map(text => text.trim()));

        await row("work on something unrelated").click();
        await row("hunk sibling").click({ modifiers: [modifier] });
        await row("change both").click({ modifiers: [modifier] });
        await expect.poll(selected).toEqual(["work on something unrelated", "change both", "hunk sibling"]);
        expect(await page.getByRole("status").filter({ hasText: "selected" }).textContent()).toContain("3");
        // the panels follow the revision clicked last
        await expect.poll(() => page.locator(".description-panel").textContent()).toContain("change both");

        await row("hunk sibling").click({ button: "right" });
        let menu = page.getByRole("menu");
        await menu.getByRole("menuitem", { name: "Annotate 3 changes…" }).waitFor();
        // this mixed selection includes protected changes.
        expect(await menu.getByRole("menuitem", { name: "Abandon selected…", exact: true }).count()).toBe(0);
        expect(await menu.getByRole("menuitem", { name: "Rebase each onto…", exact: true }).count()).toBe(0);
        expect(await menu.getByRole("menuitem", { name: "Squash into parent", exact: true }).count()).toBe(0);
        await page.keyboard.press("Escape");

        await row("change both").click({ modifiers: [modifier] });
        await expect.poll(selected).toEqual(["work on something unrelated", "hunk sibling"]);

        // keyboard: Ctrl+arrows move without clearing, Ctrl+Space toggles, Escape clears
        await page.keyboard.press(`${modifier}+ArrowDown`);
        await page.keyboard.press(`${modifier}+Space`);
        await expect.poll(async () => (await selected()).length).toBe(3);
        await page.keyboard.press("Escape");
        await expect.poll(async () => (await selected()).length).toBe(1);

        await row("work on something unrelated").click({ modifiers: [modifier] });
        await row("small file child").click();
        await row("small file parent").click({ modifiers: ["Shift"] });
        await expect.poll(selected).toEqual(["small file child", "small file parent"]);
    });
});
