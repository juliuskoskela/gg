import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness.js";

describe("GG+ workspace", () => {
    let ctx: TestContext;
    beforeEach(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await ctx.page.setViewportSize({ width: 1440, height: 900 });
    });
    afterEach(async () => destroyContext(ctx));

    it("keeps graph context when jumping to working copy, filters views, and resizes with the keyboard", async () => {
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.waitFor();
        let original = await filter.inputValue();
        await ctx.page.getByRole("button", { name: "Jump to working copy" }).click();
        await ctx.page.getByRole("heading", { name: "Working copy", exact: true }).waitFor();
        expect(await filter.inputValue()).toBe(original);
        let splitter = ctx.page.getByRole("separator", { name: "Resize revision graph" });
        let previous = Number(await splitter.getAttribute("aria-valuenow"));
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(previous + 24);
        await ctx.page.evaluate(() => document.documentElement.dir = "rtl");
        await splitter.press("ArrowLeft");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(previous + 48);
        await ctx.page.evaluate(() => document.documentElement.dir = "ltr");
        await splitter.press("End");
        let maximum = Number(await splitter.getAttribute("aria-valuemax"));
        expect(maximum).toBeGreaterThan(480);
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(maximum);
        expect((await ctx.page.locator(".detail-region").boundingBox())!.width).toBeGreaterThanOrEqual(480);
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(maximum);
        let dividerBounds = (await splitter.boundingBox())!;
        let workspaceBounds = (await ctx.page.locator(".two-pane").boundingBox())!;
        await ctx.page.mouse.move(dividerBounds.x + 2, dividerBounds.y + 80);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(workspaceBounds.x + 600, dividerBounds.y + 80);
        await ctx.page.mouse.up();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(600);
        await splitter.press("Home");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(240);
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        await ctx.page.getByRole("button", { name: "Bookmarks", exact: true }).click();
        await expect.poll(() => filter.inputValue()).toBe("bookmarks()");
        expect(await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).isVisible()).toBe(true);
        await filter.fill("description('no matching revision')");
        await filter.press("Tab");
        await expect.poll(() => ctx.page.locator(".view-name").textContent()).toBe("Custom");
        let empty = ctx.page.getByRole("heading", { name: "No revisions match", exact: true });
        await empty.waitFor();
        expect((await empty.boundingBox())!.y).toBeLessThan((await ctx.page.locator(".graph-body").boundingBox())!.y + (await ctx.page.locator(".graph-body").boundingBox())!.height);
        await ctx.page.route("**/api/query/query_snapshot", route => route.fulfill({ status: 503, body: "Snapshot temporarily unavailable" }));
        await ctx.page.getByRole("button", { name: "More repository actions" }).click();
        await ctx.page.getByRole("button", { name: "Refresh", exact: true }).click();
        await ctx.page.getByRole("alert").waitFor();
        expect((await ctx.page.locator(".workspace-content").boundingBox())!.height).toBeGreaterThan(300);
    });

    it("focuses either pane and preserves description drafts with persistent navigation", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        await editor.fill("Draft preserved while browsing history");
        await ctx.page.getByRole("button", { name: "Hide revision", exact: true }).click();
        expect(await ctx.page.locator(".detail-region").isVisible()).toBe(false);
        expect(await ctx.page.getByRole("group", { name: "Revision actions", exact: true }).isVisible()).toBe(true);
        await ctx.page.getByRole("button", { name: "Show revision", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Hide revision graph", exact: true }).click();
        expect(await ctx.page.locator(".log-region").isVisible()).toBe(false);
        expect(await editor.inputValue()).toBe("Draft preserved while browsing history");
        await ctx.page.getByRole("button", { name: "Show revision graph", exact: true }).click();
        expect(await ctx.page.locator(".log-region").isVisible()).toBe(true);
        let sheet = ctx.page.locator(".workspace-sheet");
        let railWidth = (await sheet.boundingBox())!.x;
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        expect((await sheet.boundingBox())!.x).toBeGreaterThan(railWidth);
        await ctx.page.getByRole("button", { name: "Working copy", exact: true }).click();
        expect(await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).isVisible()).toBe(true);
        await ctx.page.reload();
        await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).waitFor();
        await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).click();
        expect((await sheet.boundingBox())!.x).toBe(railWidth);

    });

    it("renders highlighted split and unified diffs with searchable folder browsing", async () => {
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("yvtwywll");
        await filter.press("Tab");
        let pre = ctx.page.locator(".diff-viewer pre");
        await pre.waitFor();
        await ctx.page.getByRole("combobox", { name: "Diff layout" }).selectOption("split");
        await expect.poll(() => pre.getAttribute("data-diff-type")).toBe("split");
        expect(await ctx.page.locator(".diff-viewer [data-line]").count()).toBeGreaterThan(0);
        await ctx.page.getByRole("combobox", { name: "Diff layout" }).selectOption("unified");
        await expect.poll(() => pre.getAttribute("data-diff-type")).toBe("single");
        await ctx.page.getByRole("button", { name: "Wrap diff lines" }).click();
        expect(await ctx.page.getByRole("button", { name: "Wrap diff lines" }).getAttribute("aria-pressed")).toBe("true");
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        expect(await files.isVisible()).toBe(true);
        await ctx.page.getByRole("searchbox", { name: "Filter changed files" }).fill("no-such-file");
        expect(await files.textContent()).toContain("No matching files");
        await ctx.page.getByRole("button", { name: "Hide changed files" }).click();
        expect(await files.count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Show changed files" }).click();
        expect(await files.isVisible()).toBe(true);
    });

    it("keeps panel controls fixed and files aligned with the whole revision", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Edit revision description" }).waitFor();
        let history = ctx.page.locator('.workspace-panels [aria-controls="timeline-panel"]');
        let revision = ctx.page.locator('.workspace-panels [aria-controls="change-panel"]');
        let files = ctx.page.locator('.workspace-panels [aria-controls="changed-files"]');
        let positions = await Promise.all([history, revision, files].map(control => control.boundingBox()));
        for (let control of [files, files, history, history, revision, revision]) {
            await control.click();
            for (let [index, button] of [history, revision, files].entries()) {
                let bounds = (await button.boundingBox())!;
                expect(bounds.x).toBe(positions[index]!.x);
                expect(bounds.y).toBe(positions[index]!.y);
            }
        }
        let tree = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        let treeBounds = (await tree.boundingBox())!;
        let workspace = (await ctx.page.locator(".revision-workspace").boundingBox())!;
        expect(treeBounds.y).toBe(workspace.y);
        expect(treeBounds.height).toBe(workspace.height);
        let overviewBounds = (await ctx.page.locator(".overview").boundingBox())!;
        expect(treeBounds.x).toBeGreaterThanOrEqual(overviewBounds.x + overviewBounds.width);
        expect(await ctx.page.locator('.diff-toolbar [aria-controls="changed-files"],.file-tree [aria-controls="changed-files"]').count()).toBe(0);
    });

    it("resizes the desktop changed-files panel and remembers its width", async () => {
        await ctx.page.addInitScript(() => { if (localStorage.getItem("gg.layout.files-width") === null) localStorage.setItem("gg.layout.files-width", "-50"); });
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Hide revision graph", exact: true }).click();
        let splitter = ctx.page.getByRole("separator", { name: "Resize changed files" });
        await splitter.waitFor();
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        let original = Number(await splitter.getAttribute("aria-valuenow"));
        expect(original).toBe(180);
        await splitter.press("ArrowLeft");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(original + 24);
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(original);
        await ctx.page.evaluate(() => document.documentElement.dir = "rtl");
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(original + 24);
        await ctx.page.evaluate(() => document.documentElement.dir = "ltr");
        await splitter.press("Home");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(180);
        await splitter.press("End");
        let maximum = Number(await splitter.getAttribute("aria-valuemax"));
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(maximum);
        expect((await ctx.page.locator(".revision-content").boundingBox())!.width).toBeGreaterThanOrEqual(280);
        let bounds = (await splitter.boundingBox())!;
        let workspace = (await ctx.page.locator(".revision-workspace").boundingBox())!;
        await ctx.page.mouse.move(bounds.x + 2, bounds.y + 50);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(workspace.x + workspace.width - 320, bounds.y + 50);
        await ctx.page.mouse.up();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(320);
        expect((await files.boundingBox())!.width).toBe(320);
        await ctx.page.getByRole("button", { name: "Hide changed files" }).click();
        expect(await splitter.count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Show changed files" }).click();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(320);
        await ctx.page.reload();
        await splitter.waitFor();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(320);
        await splitter.press("End");
        let savedWidth = Number(await splitter.getAttribute("aria-valuenow"));
        await ctx.page.getByRole("button", { name: "Show revision graph", exact: true }).click();
        await ctx.page.setViewportSize({ width: 1024, height: 900 });
        await expect.poll(async () => Number(await splitter.getAttribute("aria-valuenow"))).toBeLessThan(savedWidth);
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(Number(await splitter.getAttribute("aria-valuemax")));
        expect((await ctx.page.locator(".revision-content").boundingBox())!.width).toBeGreaterThanOrEqual(280);
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(() => splitter.count()).toBe(0);
    });

    it("keeps changed files beside the diff when repository navigation changes", async () => {
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("yvtwywll");
        await filter.press("Tab");
        await ctx.page.locator(".diff-viewer pre").waitFor();
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        await files.waitFor();
        let originalPanel = await files.elementHandle();
        let search = files.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("no-such-file");
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        expect(await files.isVisible()).toBe(true);
        expect(await search.inputValue()).toBe("no-such-file");
        expect(await originalPanel!.evaluate(panel => panel.isConnected)).toBe(true);
        await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).click();
        expect(await originalPanel!.evaluate(panel => panel.isConnected)).toBe(true);
        await search.fill("");
        await ctx.page.locator(".file-path button").first().click();
        expect(await originalPanel!.evaluate(panel => panel.isConnected)).toBe(true);
        expect(await ctx.page.getByRole("dialog", { name: "Changed files" }).count()).toBe(0);

        await ctx.page.getByRole("button", { name: "Hide changed files" }).click();
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        expect(await files.count()).toBe(0);
        await ctx.page.locator(".file-path button").first().click();
        await files.waitFor();
        let treeBounds = (await files.boundingBox())!;
        let diffBounds = (await ctx.page.locator(".file-review").boundingBox())!;
        expect(treeBounds.x).toBeGreaterThanOrEqual(diffBounds.x + diffBounds.width - 1);
        expect(await ctx.page.getByRole("dialog", { name: "Changed files" }).count()).toBe(0);
    });

    it("keeps repository actions discoverable in phone commands", async () => {
        await ctx.page.setViewportSize({ width: 320, height: 740 });
        await ctx.page.goto(await startGG(ctx));
        let trigger = ctx.page.getByRole("button", { name: "Commands", exact: true });
        await trigger.click();
        let commands = ctx.page.getByRole("dialog", { name: "Commands" });
        for (let name of [/Fetch remote bookmarks/, /Push all bookmarks/, /Undo/]) {
            expect(await commands.getByRole("button", { name }).isVisible()).toBe(true);
        }
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
        await ctx.page.keyboard.press("Escape");
        expect(await commands.isVisible()).toBe(false);
        expect(await trigger.evaluate(button => button === document.activeElement)).toBe(true);
    });

    it("opens phone file browsing inside the revision and restores focus after selecting or closing", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("yvtwywll");
        await filter.press("Tab");
        await ctx.page.locator('.graph button[id^="Revision-"]').filter({ hasText: "yvtwywll" }).first().click();
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.locator(".diff-viewer pre").waitFor();
        let trigger = ctx.page.getByRole("button", { name: "Choose changed file" });
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        await trigger.click();
        await files.waitFor();
        let panel = (await files.boundingBox())!;
        let changes = (await ctx.page.locator(".revision-workspace").boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(changes.x);
        expect(panel.x + panel.width).toBe(changes.x + changes.width);
        expect(panel.y).toBeGreaterThanOrEqual(changes.y);
        expect(panel.y + panel.height).toBeLessThanOrEqual(changes.y + changes.height + 1);
        expect(await ctx.page.getByRole("dialog", { name: "Changed files" }).count()).toBe(0);
        let search = files.getByRole("searchbox", { name: "Filter changed files" });
        expect(await search.evaluate(input => input === document.activeElement)).toBe(true);
        await search.press("Escape");
        await expect.poll(() => files.count()).toBe(0);
        expect(await trigger.evaluate(button => button === document.activeElement)).toBe(true);

        await trigger.click();
        let file = files.getByRole("option").first();
        let selectedFile = await file.getAttribute("aria-label");
        await file.click();
        await expect.poll(() => files.count()).toBe(0);
        expect(await ctx.page.locator(".file-path").textContent()).toContain(selectedFile);
        let diff = ctx.page.getByRole("region", { name: "File diff" });
        await expect.poll(() => diff.evaluate(element => element === document.activeElement)).toBe(true);
        await ctx.page.locator(".file-path button").first().click();
        await files.waitFor();
        await ctx.page.getByRole("button", { name: "Close changed files" }).click({ position: { x: 10, y: 10 } });
        await expect.poll(() => files.isVisible()).toBe(false);
        expect(await ctx.page.evaluate(() => localStorage.getItem("gg.layout.files"))).toBe("true");
    });

    it("keeps revision details above changes and the title visible when collapsed", async () => {
        await ctx.page.addInitScript(() => {
            localStorage.setItem("gg.layout.details-docked", "true");
            localStorage.setItem("gg.layout.overview-width", "500");
        });
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Edit revision description" }).waitFor();
        await ctx.page.getByRole("button", { name: "Hide revision graph", exact: true }).click();
        let overview = ctx.page.getByRole("complementary", { name: "Revision overview" });
        let disclosure = overview.locator(".disclosure");
        let title = await disclosure.textContent();
        expect(title!.trim()).toBeTruthy();
        expect(title).not.toBe("Overview");
        expect(await ctx.page.getByRole("button", { name: "Dock overview on the right" }).count()).toBe(0);
        expect(await ctx.page.getByRole("separator", { name: "Resize revision overview" }).count()).toBe(0);
        let bounds = (await overview.boundingBox())!;
        expect(bounds.y + bounds.height).toBeLessThanOrEqual((await ctx.page.locator(".revision-main").boundingBox())!.y + 1);
        await disclosure.click();
        expect(await disclosure.getAttribute("aria-expanded")).toBe("false");
        expect(await disclosure.isVisible()).toBe(true);
        expect(await disclosure.textContent()).toBe(title);
        expect(await ctx.page.locator("#revision-overview-content").isVisible()).toBe(false);
        await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        await editor.fill("A full-width revision description that stays readable across workspace sizes");
        expect(await disclosure.getAttribute("aria-expanded")).toBe("true");
        expect((await editor.boundingBox())!.width).toBeGreaterThan(bounds.width - 40);
        await ctx.page.setViewportSize({ width: 834, height: 1194 });
        expect(await editor.inputValue()).toContain("full-width revision description");
        await ctx.page.getByRole("button", { name: "Cancel description edit" }).click();
        expect(await disclosure.textContent()).toBe(title);
    });

    it("keeps graph context through phone preview, full inspection and navigation", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.goto(await startGG(ctx));
        let graph = ctx.page.locator(".log-region");
        let graphHandle = await graph.elementHandle();
        await ctx.page.locator(".graph").getByRole("option").first().click();
        let preview = ctx.page.getByRole("region", { name: "Revision preview" });
        await preview.waitFor();
        expect(await graph.isVisible()).toBe(true);
        expect(await preview.getAttribute("data-presentation")).toBe("half");
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await ctx.page.getByRole("heading", { name: "Revision", exact: true }).waitFor();
        expect(new URL(ctx.page.url()).searchParams.get("inspect")).toBeTruthy();
        expect(await graphHandle!.evaluate(element => element.isConnected)).toBe(true);
        await ctx.page.getByRole("button", { name: "Back to graph" }).click();
        await expect.poll(() => preview.getAttribute("data-presentation")).toBe("half");
        expect(await graph.isVisible()).toBe(true);
        expect(await graphHandle!.evaluate(element => element.isConnected)).toBe(true);
        let trigger = ctx.page.getByRole("button", { name: "Open repository navigation" });
        await trigger.click();
        await ctx.page.getByRole("button", { name: "Working copy", exact: true }).click();
        await expect.poll(() => preview.getAttribute("data-presentation")).toBe("half");
        expect(await preview.textContent()).toContain("Working copy");
        await trigger.click();
        let drawer = ctx.page.getByRole("dialog", { name: "Repository navigation" });
        await drawer.waitFor();
        await ctx.page.keyboard.press("Escape");
        await expect.poll(() => drawer.isVisible()).toBe(false);
        expect(await trigger.evaluate(button => button === document.activeElement)).toBe(true);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    it("opens a shift-selected range with both endpoints in its link", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.goto(await startGG(ctx));
        let rows = ctx.page.locator(".graph").getByRole("option");
        await expect.poll(() => rows.count()).toBeGreaterThan(2);
        await rows.nth(0).click();
        await rows.nth(1).click({ modifiers: ["Shift"] });
        await expect.poll(() => ctx.page.locator('.graph [aria-selected="true"]').count()).toBeGreaterThan(1);
        await ctx.page.getByRole("button", { name: "Open full revision" }).click();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspectFrom")).toBeTruthy();
        let link = new URL(ctx.page.url());
        expect(link.searchParams.get("inspectFrom")).not.toBe(link.searchParams.get("inspect"));
    });

    it("restores a historical revision range from a full inspection link", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        let base = await startGG(ctx);
        let results: Array<{ from: string; to: string; count: number }> = [];
        ctx.page.on("response", async response => {
            if (!response.url().includes("/api/query/query_revision_summary") || !response.ok()) return;
            let request = response.request().postDataJSON();
            let body = await response.json();
            if (body.type === "Detail") results.push({ from: request.set.from.change.hex, to: request.set.to.change.hex, count: body.headers.length });
        });
        await ctx.page.goto(`${base}/?inspect=${encodeURIComponent("@-")}&inspectFrom=${encodeURIComponent("@--")}`);
        await ctx.page.getByRole("heading", { name: "Revision", exact: true }).waitFor();
        await expect.poll(() => results.some(result => result.from === "@--" && result.to === "@-" && result.count > 1)).toBe(true);
        let link = new URL(ctx.page.url());
        expect(link.searchParams.get("inspectFrom")).toBeTruthy();
        expect(link.searchParams.get("inspect")).toBeTruthy();
        expect(link.searchParams.get("inspectFrom")).not.toBe(link.searchParams.get("inspect"));
    });

    it("saves a description, undoes it, and opens the revset dialog", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        let previous = await editor.inputValue();
        await editor.fill("Inspect GG+ description workflow");
        await ctx.page.getByRole("button", { name: "Save revision description", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".graph").textContent()).toContain("Inspect GG+ description workflow");
        await ctx.page.getByRole("button", { name: "Undo the latest operation", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".overview-heading .disclosure").textContent()).toBe(previous.split("\n")[0] || "(no description set)");
        let revset = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await revset.fill("description('no matching revision')");
        await revset.press("Tab");
        await ctx.page.getByRole("button", { name: "Save revset", exact: true }).click();
        let dialog = ctx.page.getByRole("dialog", { name: "Save revset" });
        await dialog.waitFor();
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        expect(await dialog.count()).toBe(0);
    });
});
