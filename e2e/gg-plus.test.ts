import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeView, createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness.js";

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
        await ctx.page.getByRole("button", { name: "Working copy", exact: true }).click();
        await ctx.page.getByRole("textbox", { name: "Revision description" }).waitFor();
        expect(await filter.inputValue()).toBe(original);
        let splitter = ctx.page.getByRole("separator", { name: "Resize panels" }).first();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(42);
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(46);
        await ctx.page.evaluate(() => document.documentElement.dir = "rtl");
        await splitter.press("ArrowLeft");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(50);
        await ctx.page.evaluate(() => document.documentElement.dir = "ltr");
        await splitter.press("End");
        expect(Number(await splitter.getAttribute("aria-valuemax"))).toBe(84);
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(84);
        let description = ctx.page.locator(".description-panel");
        expect(await description.isVisible()).toBe(true);
        expect((await description.boundingBox())!.width).toBeGreaterThan(40);
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(84);
        let dividerBounds = (await splitter.boundingBox())!;
        let dockBounds = (await ctx.page.locator(".workspace-dock").boundingBox())!;
        await ctx.page.mouse.move(dividerBounds.x + 2, dividerBounds.y + 80);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(dockBounds.x + dockBounds.width * 0.3, dividerBounds.y + 80);
        await ctx.page.mouse.up();
        let dragged = Number(await splitter.getAttribute("aria-valuenow"));
        expect(dragged).toBeGreaterThanOrEqual(16);
        expect(dragged).toBeLessThan(84);
        await splitter.press("Home");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(16);
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        await ctx.page.getByRole("button", { name: "Bookmarks", exact: true }).click();
        await expect.poll(() => filter.inputValue()).toBe("bookmarks()");
        expect(await ctx.page.getByRole("button", { name: "Collapse repository navigation" }).isVisible()).toBe(true);
        await filter.fill("description('no matching revision')");
        await filter.press("Tab");
        expect(await filter.inputValue()).toBe("description('no matching revision')");
        let empty = ctx.page.getByRole("heading", { name: "No revisions match", exact: true });
        await empty.waitFor();
        expect((await empty.boundingBox())!.y).toBeLessThan((await ctx.page.locator(".graph-body").boundingBox())!.y + (await ctx.page.locator(".graph-body").boundingBox())!.height);
        await ctx.page.route("**/api/query/query_snapshot", route => route.fulfill({ status: 503, body: "Snapshot temporarily unavailable" }));
        await ctx.page.getByRole("button", { name: "Refresh repository", exact: true }).click();
        await ctx.page.getByRole("alert").waitFor();
        expect((await ctx.page.locator(".workspace-content").boundingBox())!.height).toBeGreaterThan(300);
    });

    it("focuses either pane and preserves description drafts with persistent navigation", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.locator(".overview .revision-metadata").waitFor();
        if (!await ctx.page.getByRole("textbox", { name: "Revision description" }).isVisible()) await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        await editor.fill("Draft preserved while browsing history");
        await closeView(ctx.page, "Description");
        expect(await ctx.page.locator(".description-panel").count()).toBe(0);
        expect(await ctx.page.getByRole("group", { name: "Revision actions", exact: true }).count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Description", exact: true }).click();
        await expect.poll(() => editor.inputValue()).toBe("Draft preserved while browsing history");
        await closeView(ctx.page, "Timeline");
        expect(await ctx.page.locator(".graph").count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Timeline", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".graph").isVisible()).toBe(true);
        expect(await editor.inputValue()).toBe("Draft preserved while browsing history");
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

    it("opens revision tools independently of the editable description", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.getByRole("textbox", { name: "Revision description", exact: true }).waitFor();
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Revision tools", exact: true }).click();
        await ctx.page.locator(".revision-tools").waitFor();
        for (let name of ["Copy change ID", "Copy commit ID", "New child", "Abandon"]) {
            expect(await ctx.page.locator(".revision-tools").getByRole("button", { name, exact: true }).count()).toBe(1);
        }
        expect(await ctx.page.locator(".overview .revision-tools, .overview .revision-actions").count()).toBe(0);
        await closeView(ctx.page, "Revision tools");
        expect(await ctx.page.locator(".revision-tools").count()).toBe(0);
        expect(await ctx.page.getByRole("textbox", { name: "Revision description", exact: true }).isVisible()).toBe(true);
        let gutters = await ctx.page.locator(".timeline-section").evaluate(node => {
            let outer = node.getBoundingClientRect();
            let list = node.querySelector(".listbox")!.getBoundingClientRect();
            return [list.left - outer.left, outer.right - list.right];
        });
        expect(gutters).toEqual([12, 12]);
        let footer = ctx.page.locator(".timeline-footer");
        expect(await footer.getByRole("textbox", { name: "Filter revisions with a revset" }).count()).toBe(1);
        expect(await footer.getByRole("combobox", { name: "Saved revset" }).count()).toBe(1);
        let footerBounds = (await footer.boundingBox())!;
        let panelBounds = (await ctx.page.locator("#panel-timeline").boundingBox())!;
        expect(Math.abs(footerBounds.y + footerBounds.height - panelBounds.y - panelBounds.height)).toBeLessThanOrEqual(1);
        await ctx.page.locator(".graph-body .listbox").evaluate(node => node.scrollTop = node.scrollHeight);
        expect((await footer.boundingBox())!.y).toBe(footerBounds.y);
    });

    it("renders highlighted split and unified diffs with searchable folder browsing", async () => {
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("yvtwywll");
        await filter.press("Tab");
        let pre = ctx.page.locator(".diff-viewer pre");
        await pre.waitFor();
        await ctx.page.getByRole("group", { name: "Diff layout", exact: true }).getByRole("button", { name: "Side by side", exact: true }).click();
        await expect.poll(() => pre.getAttribute("data-diff-type")).toBe("split");
        expect(await ctx.page.locator(".diff-viewer [data-line]").count()).toBeGreaterThan(0);
        await ctx.page.getByRole("group", { name: "Diff layout", exact: true }).getByRole("button", { name: "Stacked", exact: true }).click();
        await expect.poll(() => pre.getAttribute("data-diff-type")).toBe("single");
        await ctx.page.getByRole("button", { name: "Wrap lines" }).click();
        expect(await ctx.page.getByRole("button", { name: "Wrap lines" }).getAttribute("aria-pressed")).toBe("true");
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        expect(await files.isVisible()).toBe(true);
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.fill("no-such-file");
        expect(await files.textContent()).toContain("No matching files");
        await closeView(ctx.page, "Files");
        expect(await files.count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Files", exact: true }).click();
        await files.waitFor();
        expect(await search.inputValue()).toBe("no-such-file");
        expect(await files.textContent()).toContain("No matching files");
    });

    it("keeps panel controls fixed and files aligned with the whole revision", async () => {
        await ctx.page.goto(await startGG(ctx));
        let filter = ctx.page.getByRole("textbox", { name: "Filter revisions with a revset" });
        await filter.fill("yvtwywll");
        await filter.press("Tab");
        await ctx.page.locator(".file-review").waitFor();
        await ctx.page.locator(".description-panel .revision-heading").waitFor();
        let views = ctx.page.getByRole("button", { name: "Views", exact: true });
        let viewsPosition = (await views.boundingBox())!;
        await closeView(ctx.page, "Files");
        await views.click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Files", exact: true }).click();
        let viewsBounds = (await views.boundingBox())!;
        expect(viewsBounds.x).toBe(viewsPosition.x);
        expect(viewsBounds.y).toBe(viewsPosition.y);
        let tree = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        let treeBounds = (await tree.boundingBox())!;
        let diffBounds = (await ctx.page.locator(".file-review").boundingBox())!;
        expect(treeBounds.x + treeBounds.width).toBeLessThanOrEqual(diffBounds.x + 1);
        let descriptionBounds = (await ctx.page.locator(".description-panel").boundingBox())!;
        expect(descriptionBounds.y + descriptionBounds.height).toBeLessThanOrEqual(diffBounds.y + 6);
        expect(await ctx.page.locator('.diff-toolbar [aria-controls="changed-files"]').count()).toBe(0);
        expect(await ctx.page.locator('.file-tree-heading [aria-controls="changed-files"]').count()).toBe(0);
    });

    it("remembers a panel split and hides splitters on a narrow screen", async () => {
        await ctx.page.goto(await startGG(ctx));
        let splitter = ctx.page.getByRole("separator", { name: "Resize panels" }).first();
        await splitter.waitFor();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(42);
        await splitter.press("ArrowRight");
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(46);
        await ctx.page.reload();
        await splitter.waitFor();
        expect(Number(await splitter.getAttribute("aria-valuenow"))).toBe(46);
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(() => ctx.page.getByRole("separator", { name: "Resize panels" }).count()).toBe(0);
        expect(await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).isVisible()).toBe(true);
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
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
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
        let treeBounds = (await files.boundingBox())!;
        let diffBounds = (await ctx.page.locator(".file-review").boundingBox())!;
        expect(treeBounds.x + treeBounds.width).toBeLessThanOrEqual(diffBounds.x + 1);

        await closeView(ctx.page, "Files");
        await ctx.page.getByRole("button", { name: "Expand repository navigation" }).click();
        expect(await files.count()).toBe(0);
        await ctx.page.locator(".file-path button").first().click();
        expect(await files.count()).toBe(0);
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
        await ctx.page.locator(".graph").getByRole("option").filter({ hasText: "yvtwywll" }).first().click();
        await ctx.page.getByRole("tab", { name: "Files", exact: true }).click();
        let files = ctx.page.getByRole("complementary", { name: "Changed files", exact: true });
        await files.waitFor();
        let dock = (await ctx.page.locator(".workspace-dock").boundingBox())!;
        let panel = (await files.boundingBox())!;
        expect(panel.x).toBeGreaterThanOrEqual(dock.x);
        expect(panel.x + panel.width).toBeLessThanOrEqual(dock.x + dock.width + 1);
        expect(await ctx.page.getByRole("dialog", { name: "Changed files" }).count()).toBe(0);
        let search = ctx.page.getByRole("searchbox", { name: "Filter changed files" });
        await search.press("Escape");
        expect(await files.isVisible()).toBe(true);
        let file = files.getByRole("option").first();
        let selectedFile = await file.getAttribute("aria-label");
        await file.click();
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        await ctx.page.locator(".diff-viewer pre").waitFor();
        expect(await ctx.page.locator(".file-path").textContent()).toContain(selectedFile);
        await ctx.page.keyboard.press("Escape");
        expect(await ctx.page.getByRole("tab", { name: "Diff", exact: true }).getAttribute("aria-selected")).toBe("true");
    });

    it("keeps the description at the top with always-visible aligned metadata", async () => {
        await ctx.page.addInitScript(() => localStorage.setItem("gg.layout.overview", "false"));
        await ctx.page.goto(await startGG(ctx));
        let overview = ctx.page.getByRole("complementary", { name: "Revision overview" });
        await overview.getByRole("textbox", { name: "Revision description" }).waitFor();
        expect(await overview.locator(".disclosure").count()).toBe(0);
        let panel = (await ctx.page.locator(".description-panel").boundingBox())!;
        let heading = (await overview.getByRole("textbox", { name: "Revision description" }).boundingBox())!;
        expect(heading.y - panel.y).toBeLessThan(40);
        let values = await overview.locator(".metadata-row dd").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().x));
        expect(new Set(values).size).toBe(1);
        await ctx.page.locator(".overview .revision-metadata").waitFor();
        if (!await ctx.page.getByRole("textbox", { name: "Revision description" }).isVisible()) await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        await editor.fill("A full-width revision description that stays readable across workspace sizes");
        expect(await overview.locator('[aria-label="Revision metadata"]').isVisible()).toBe(true);
        expect((await editor.boundingBox())!.width).toBeGreaterThan(panel.width - 80);
        await ctx.page.setViewportSize({ width: 1100, height: 900 });
        expect(await editor.inputValue()).toContain("full-width revision description");
        await ctx.page.getByRole("button", { name: "Cancel description edit" }).click();
        expect(await overview.locator('[aria-label="Revision metadata"]').isVisible()).toBe(true);
    });

    it("keeps graph context through phone preview, full inspection and navigation", async () => {
        await ctx.page.setViewportSize({ width: 390, height: 844 });
        await ctx.page.goto(await startGG(ctx));
        let graph = ctx.page.locator(".graph");
        let timeline = ctx.page.getByRole("tab", { name: "Timeline", exact: true });
        let graphHandle = await graph.elementHandle();
        await graph.getByRole("option").first().click();
        expect(await timeline.getAttribute("aria-selected")).toBe("true");
        expect(await graph.isVisible()).toBe(true);
        expect(await ctx.page.getByRole("region", { name: "Revision preview" }).count()).toBe(0);
        expect(await graphHandle!.evaluate(element => element.isConnected)).toBe(true);
        let trigger = ctx.page.getByRole("button", { name: "Open repository navigation" });
        await trigger.click();
        await ctx.page.getByRole("button", { name: "Working copy", exact: true }).click();
        expect(await timeline.getAttribute("aria-selected")).toBe("true");
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("Working copy");
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
        await expect.poll(() => ctx.page.locator(".description-panel h2").textContent()).toMatch(/\d+ revisions/);
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
        await expect.poll(() => results.some(result => result.from === "@--" && result.to === "@-" && result.count > 1)).toBe(true);
        await expect.poll(() => ctx.page.locator(".graph").isVisible()).toBe(true);
        await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain("revisions");
        let link = new URL(ctx.page.url());
        expect(link.searchParams.get("inspectFrom")).toBeTruthy();
        expect(link.searchParams.get("inspect")).toBeTruthy();
        expect(link.searchParams.get("inspectFrom")).not.toBe(link.searchParams.get("inspect"));
    });

    it("saves a description, undoes it, and opens the revset dialog", async () => {
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.locator(".overview .revision-metadata").waitFor();
        if (!await ctx.page.getByRole("textbox", { name: "Revision description" }).isVisible()) await ctx.page.getByRole("button", { name: "Edit revision description" }).click();
        let editor = ctx.page.getByRole("textbox", { name: "Revision description" });
        let previous = await editor.inputValue();
        await editor.fill("Inspect GG+ description workflow");
        await ctx.page.getByRole("button", { name: "Save revision description", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".graph").textContent()).toContain("Inspect GG+ description workflow");
        await ctx.page.getByRole("button", { name: "Undo the latest operation", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".graph").textContent()).not.toContain("Inspect GG+ description workflow");
        let subject = previous.split("\n")[0];
        if (subject) await expect.poll(() => ctx.page.locator(".graph").textContent()).toContain(subject);
        expect(await ctx.page.locator('.overview [aria-label="Revision metadata"]').isVisible()).toBe(true);
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
