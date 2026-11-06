import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { AddressInfo } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { detail, id } from "../app/plugins/review/test/fixture";
import type { Review } from "../app/plugins/review/model";

let workspace = { type: "Workspace", absolute_path: "/work/gg-plus", git_remotes: ["origin"], query_choices: { default: "all()" }, latest_query: "all()", theme_override: null, status: { operation_description: "Review scheduler", working_copy: id.commit, can_redo: false }, mark_unpushed_bookmarks: true, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: false, has_external_merge_tool: false };

describe("review extension", () => {
    let browser: Browser;
    let server: ViteDevServer;
    let url: string;
    let errors: string[] = [];
    let mutations: string[] = [];
    beforeAll(async () => {
        server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } }); await server.listen();
        url = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.GG_TEST_BROWSER || undefined });
        await mkdir("e2e/results/review", { recursive: true });
    });
    afterAll(async () => { await browser?.close(); await server?.close(); });
    async function page(width = 1440, theme = "dark", offline = false) {
        let page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
        page.setDefaultTimeout(10000);
        page.on("pageerror", cause => { errors.push(cause.message); console.log("BROWSER ERROR", cause.message); });
        await page.route("**/api/**", async route => {
            let path = new URL(route.request().url()).pathname;
            let command = path.split("/").at(-1);
            if (path.includes("/mutate/")) mutations.push(command!);
            if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
            let value: unknown = null;
            if (command === "query_workspace") value = workspace;
            else if (command === "query_log") value = { rows: [], has_more: false };
            else if (command === "query_recent_workspaces") value = [];
            else if (command === "query_current_status") value = workspace.status;
            else if (command === "query_workspace_identity") value = "default";
            else if (command === "query_workspace_context") value = { project_name: "gg-plus", repo_path: "/work/gg-plus", workspace_name: "default", workspace_path: "/work/gg-plus", workspaces: [] };
            else if (command === "query_revision_summary") value = offline ? { type: "NotFound", set: detail.set } : detail;
            else if (command === "resolve_revision_selection") value = { exact: detail.headers[0], candidates: [] };
            else if (command === "query_revision_diff") { let body = route.request().postDataJSON(); let change = detail.changes.find(c => c.path.repo_path === body.path.repo_path); value = { type: "Detail", set: detail.set, path: change?.path, change, conflict: null }; }
            await route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
        });
        await page.goto(`${url}/?inspect=@`);
        await page.evaluate(theme => { localStorage.clear(); localStorage.setItem("gg.ui.theme", theme); localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "review", panels: ["review"] }, compactActive: "review" })); }, theme);
        await page.reload();
        await page.screenshot({ path: `e2e/results/review/boot-${width}.png` });
        await page.getByRole("heading", { name: "A conversation around a change" }).waitFor();
        return page;
    }
    async function start(p: Page) {
        await p.getByRole("textbox", { name: "Your name", exact: true }).fill("Avery");
        await p.getByRole("textbox", { name: "Review title", exact: true }).fill("Typed frontier scheduler");
        await expect.poll(() => p.getByRole("button", { name: "Start review", exact: true }).isEnabled()).toBe(true);
        await p.getByRole("button", { name: "Start review", exact: true }).click();
        await p.getByRole("combobox", { name: "Review file", exact: true }).waitFor();
    }
    async function discussion(p: Page) { let toggle = p.getByRole("button", { name: /^Discussion \d/ }); if (await toggle.isVisible()) await toggle.click(); }
    async function diff(p: Page) { let toggle = p.getByRole("button", { name: /^Diff \d/ }); if (await toggle.isVisible()) await toggle.click(); }
    async function general(p: Page, scope: string, body: string) {
        await discussion(p); await p.getByRole("combobox", { name: "Comment target", exact: true }).selectOption(scope);
        await p.getByRole("button", { name: "Comment", exact: true }).click();
        await p.getByRole("textbox", { name: "Review comment", exact: true }).fill(body);
        await p.getByRole("button", { name: "Add comment", exact: true }).click();
    }
    async function download(p: Page): Promise<Review> {
        let ready = p.waitForEvent("download"); await p.getByRole("button", { name: "Finish & export", exact: true }).click(); let file = await ready;
        let json = JSON.parse(await readFile((await file.path())!, "utf8")); expect(json.format).toBe("gg.review"); return json;
    }
    async function importJSON(p: Page, review: Review | object) { await p.getByLabel("Import review JSON", { exact: true }).setInputFiles({ name: "review.gg-review.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(review)) }); }

    it("opens the review pane directly without a saved dock layout", async () => {
        let p = await page();
        await p.evaluate(() => localStorage.removeItem("gg.dock.layout"));
        await p.goto(`${url}/?panel=review&inspect=@`);
        await p.getByRole("heading", { name: "A conversation around a change" }).waitFor();
        expect(await p.locator("#panel-tab-review").getAttribute("aria-selected")).toBe("true");
        await p.close();
    });
    it("captures all scopes, line discussions and seen files; transfers the review to an offline recipient and merges replies back", async () => {
        let author = await page(); await start(author);
        await author.getByRole("checkbox", { name: "Seen", exact: true }).check();
        await general(author, "change", "Can we keep the scheduling order stable?");
        await general(author, "revision", "This exact implementation needs a regression test.");
        await general(author, "revset", "The selected stack is ready for a closer look.");
        // exercise the renderer's native line selection, not a synthetic review-store shortcut.
        let line = author.locator('diffs-container [data-gutter] [data-column-number="3"]').last();
        await line.click();
        await author.getByRole("button", { name: "Comment on new line 3", exact: true }).click();
        await author.getByRole("textbox", { name: "Review comment", exact: true }).fill("Could we document the tie-breaking rule here?");
        await author.getByRole("button", { name: "Add comment", exact: true }).click();
        await expect.poll(() => author.locator(".diff-review-note").count()).toBe(1);
        let exported = await download(author);
        expect(exported.threads.map(t => t.anchor.kind)).toEqual(["change", "revision", "revset", "line"]);
        expect(exported.snapshot.files).toHaveLength(2); expect(exported.seen).toHaveLength(1); expect(exported.completedAt).not.toBeNull();
        let recipient = await page(1440, "light", true); await importJSON(recipient, exported);
        await recipient.getByRole("combobox", { name: "Review file", exact: true }).waitFor();
        expect(await recipient.getByRole("checkbox", { name: "Seen", exact: true }).isChecked()).toBe(false);
        expect(await recipient.locator("diffs-container").count()).toBe(1);
        await recipient.getByRole("textbox", { name: "Your name", exact: true }).fill("Blair");
        await recipient.getByRole("textbox", { name: "Your name", exact: true }).press("Tab");
        let thread = recipient.getByRole("article").filter({ hasText: "tie-breaking rule" });
        await thread.getByRole("button", { name: "Reply", exact: true }).click();
        await thread.getByRole("textbox", { name: "Reply to discussion" }).fill("Added a deterministic secondary key and a regression test.");
        await thread.getByRole("button", { name: "Reply", exact: true }).click();
        await thread.getByRole("combobox", { name: /^Discussion status/ }).selectOption("resolved");
        await recipient.getByRole("checkbox", { name: "Seen", exact: true }).check();
        let returned = await download(recipient); await importJSON(author, returned); await importJSON(author, returned);
        let merged = await download(author);
        expect(merged.threads).toHaveLength(4); expect(merged.threads[3].posts).toHaveLength(2); expect(merged.threads[3].posts[1].author.name).toBe("Blair");
        expect(merged.threads[3].events[0].status).toBe("resolved"); expect(merged.seen).toHaveLength(2);
        await author.reload(); await author.getByText("Added a deterministic secondary key and a regression test.", { exact: true }).waitFor();
        let invalid = structuredClone(returned); invalid.snapshot.files[0].change.path.repo_path = "different.ts";
        await importJSON(author, invalid); await author.getByRole("alert").filter({ hasText: "different snapshot" }).waitFor();
        expect((await download(author)).snapshot).toEqual(exported.snapshot);
        await author.screenshot({ path: "e2e/results/review/discussions-dark.png" });
        await recipient.screenshot({ path: "e2e/results/review/discussions-light.png" });
        expect(mutations).toEqual([]); expect(errors).toEqual([]);
        await author.close(); await recipient.close();
    });
    it("allows keyboard users to comment on a precise line range", async () => {
        let p = await page(390); await start(p);
        let picker = p.locator(".line-picker > summary"); await picker.focus(); await picker.press("Enter");
        await p.getByRole("textbox", { name: "Start line", exact: true }).fill("3");
        await p.getByRole("textbox", { name: "End line", exact: true }).fill("5");
        await p.getByRole("button", { name: "Write comment", exact: true }).focus(); await p.keyboard.press("Enter");
        let comment = p.getByRole("textbox", { name: "Review comment", exact: true });
        await expect.poll(() => comment.evaluate(node => node === document.activeElement)).toBe(true);
        await comment.fill("Please document this range."); await p.getByRole("button", { name: "Add comment", exact: true }).click();
        let review = await download(p); expect(review.threads[0].anchor).toMatchObject({ kind: "line", start: 3, end: 5, side: "additions" });
        await p.close();
    });
    it("registers as an optional view and preserves reviews when the extension is disabled", async () => {
        let p = await page(); await start(p);
        await general(p, "change", "Keep this discussion when the plugin is disabled.");
        await p.getByRole("button", { name: "Views", exact: true }).click();
        await p.getByRole("menuitemcheckbox", { name: "Review", exact: true }).click();
        expect(await p.locator("#panel-tab-review").count()).toBe(0);
        await p.getByRole("menuitemcheckbox", { name: "Review", exact: true }).click();
        await p.getByRole("combobox", { name: "Review file", exact: true }).waitFor();
        await p.getByRole("button", { name: "Settings", exact: true }).click();
        await p.getByRole("button", { name: "Enabled", exact: true }).click();
        await p.getByRole("button", { name: "Views", exact: true }).click();
        expect(await p.getByRole("menuitemcheckbox", { name: "Review", exact: true }).count()).toBe(0);
        await p.getByRole("button", { name: "Views", exact: true }).click();
        await p.getByRole("button", { name: "Disabled", exact: true }).click();
        await p.getByRole("button", { name: "Views", exact: true }).click();
        expect(await p.getByRole("menuitemcheckbox", { name: "Review", exact: true }).count()).toBe(1);
        expect(await p.getByText("Keep this discussion when the plugin is disabled.", { exact: true }).count()).toBe(1);
        await p.close();
    });
    it.each([1440, 768, 390, 320].flatMap(width => ["light", "dark"].map(theme => ({ width, theme }))))("keeps review usable in $theme at $width px", async ({ width, theme }) => {
        let p = await page(width, theme); await start(p);
        await general(p, "change", "Preserve ordering across equal-priority tasks. <script>window.compromised=true</script>");
        await general(p, "revision", "The patch is small and readable.");
        let article = p.getByRole("article").first();
        await article.getByRole("combobox", { name: /^Discussion status/ }).selectOption("obsolete");
        await p.getByRole("combobox", { name: "Filter discussions" }).selectOption("obsolete");
        expect(await p.getByRole("article").count()).toBe(1);
        await p.getByRole("combobox", { name: "Filter discussions" }).selectOption("all");
        expect(await p.getByRole("article").count()).toBe(2);
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await p.evaluate("window.compromised")).toBeUndefined();
        await p.screenshot({ path: `e2e/results/review/discussion-${theme}-${width}.png` });
        await diff(p); await p.getByRole("combobox", { name: "Review file", exact: true }).selectOption({ index: 1 });
        await p.getByRole("checkbox", { name: "Seen", exact: true }).check();
        expect(await p.getByText("1 / 2 files seen by you", { exact: true }).isVisible()).toBe(true);
        let fileValue = await p.getByRole("combobox", { name: "Review file", exact: true }).inputValue();
        await p.getByRole("combobox", { name: "Review file", exact: true }).selectOption({ index: 0 });
        expect(await p.getByRole("checkbox", { name: "Seen", exact: true }).isChecked()).toBe(false);
        await p.getByRole("combobox", { name: "Review file", exact: true }).selectOption(fileValue);
        expect(await p.getByRole("checkbox", { name: "Seen", exact: true }).isChecked()).toBe(true);
        await p.screenshot({ path: `e2e/results/review/diff-${theme}-${width}.png` });
        await p.getByRole("button", { name: "Expand review", exact: true }).click();
        expect(await p.locator(".review-plugin.expanded").count()).toBe(1); await p.keyboard.press("Escape"); expect(await p.locator(".review-plugin.expanded").count()).toBe(0);
        await p.close();
    });
});
