import { expect, test } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "../harness";
import type { AnnotationList } from "../../app/messages/AnnotationList";

let notes: AnnotationList = {
    location: "visual-fixture",
    me: { name: "Reviewer", kind: "human" },
    threads: [{
        id: "visual-note", workspace: "default", status: "open",
        created_at: "2026-01-10T12:00:00Z", updated_at: "2026-01-10T12:00:00Z",
        targets: [{ subject: "resolve the conflict", state: { type: "current" }, anchor: {
            kind: "revision", change_id: "yvtwywllxwqmzlrokvunwmllnlxztkqq", commit_id: "1111111111111111111111111111111111111111",
        } }],
        posts: [{ id: "visual-post", author: { name: "Reviewer", kind: "human" }, created_at: "2026-01-10T12:00:00Z", body: "Keep the conflict resolution explicit.\n\nThe final file should preserve **both** changes." }],
    }],
};

for (let theme of ["light", "dark"] as const) for (let width of [1440, 390]) {
    test(`${theme} workspace at ${width}px`, async () => {
        let ctx: TestContext = await createContext();
        let root = ctx.tempDir;
        ctx.tempDir = join(root, "visual-fixture");
        try {
            await mkdir(ctx.tempDir);
            extractTestRepo(ctx.tempDir);
            await ctx.page.close();
            ctx.page = await ctx.browser.newPage({ viewport: { width, height: 900 }, locale: "en-US", timezoneId: "UTC", deviceScaleFactor: 1 });
            let page = ctx.page;
            await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
            await page.clock.setFixedTime(new Date("2026-01-11T12:00:00Z"));
            await page.addInitScript(({ theme }) => {
                localStorage.setItem("gg.ui.theme", theme);
                localStorage.setItem("gg.ui.theme.family", "neutral");
                localStorage.setItem("gg.ui.theme.dark-depth", "twilight");
            }, { theme });
            await page.route("**/api/annotate/annotations", route => route.fulfill({ json: notes }));
            let url = await startGG(ctx);
            async function panel(id: string) {
                if (page.url() === "about:blank") await page.goto(url);
                await page.evaluate(id => localStorage.setItem("gg.dock.layout", JSON.stringify({
                    version: 1, root: { type: "tabs", active: id, panels: [id] }, compactActive: id,
                })), id);
                await page.goto(`${url}/?inspect=yvtwywll`);
                await page.locator(`#panel-${id}`).waitFor();
                await page.evaluate(() => document.fonts.ready);
            }
            async function snapshot(name: string) {
                await page.mouse.move(0, 0);
                await expect(page).toHaveScreenshot(`${theme}-${width}-${name}.png`);
            }
            await panel("timeline");
            await page.locator(".graph .selection-item").first().waitFor();
            await snapshot("timeline-sparse");
            await page.getByRole("button", { name: "Timeline display" }).click();
            await page.getByRole("menuitemcheckbox", { name: "Authors", exact: true }).click();
            await expect(page.locator(".graph .author").first()).toBeVisible();
            await snapshot("timeline-dense");
            await page.locator(".graph .selection-item").first().click({ button: "right" });
            await expect(page.getByRole("menu")).toBeVisible();
            await snapshot("context-menu");
            await page.keyboard.press("Escape");
            await panel("description");
            await expect(page.locator(".description-panel h2")).toHaveText("resolve the conflict");
            await snapshot("description");
            await panel("tree");
            await expect(page.getByRole("listbox", { name: "Changed files" }).getByRole("option").first()).toBeVisible();
            await snapshot("files");
            await panel("diff");
            let pre = page.locator(".diff-viewer pre").first();
            await expect(pre).toBeVisible();
            await page.getByRole("button", { name: "Stacked", exact: true }).click();
            await expect(pre).toHaveAttribute("data-diff-type", "single");
            await snapshot("diff-unified");
            await page.getByRole("button", { name: "Side by side", exact: true }).click();
            await expect(pre).toHaveAttribute("data-diff-type", "split");
            await snapshot("diff-split");
            await page.getByRole("button", { name: "Wrap lines", exact: true }).click();
            await expect(page.getByRole("button", { name: "Wrap lines", exact: true })).toHaveAttribute("aria-pressed", "true");
            await snapshot("diff-wrapped");
            for (let id of ["evolution", "history", "annotations", "settings"]) {
                await panel(id);
                if (id === "annotations") await expect(page.getByRole("list", { name: "Notes" })).toContainText("Keep the conflict resolution explicit");
                if (id === "history" || id === "evolution") await expect(page.locator(".log-list [data-log-row]").first()).toBeVisible();
                await snapshot(id);
            }
            await page.getByRole("button", { name: "Views", exact: true }).click();
            await expect(page.getByRole("menu")).toBeVisible();
            await snapshot("views-menu");
        } finally {
            await destroyContext(ctx);
            await rm(root, { recursive: true, force: true });
        }
    });
}
