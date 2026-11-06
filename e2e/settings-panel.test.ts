import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";

let workspace = {
    type: "Workspace", absolute_path: "/work/gg", git_remotes: ["origin", "upstream"], query_choices: { default: "all()" }, latest_query: "all()", theme_override: null,
    status: { operation_description: "describe test revision", working_copy: { type: "CommitId", hex: "abc", prefix: "a", rest: "bc" }, can_redo: true },
    mark_unpushed_bookmarks: true, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: false, has_external_merge_tool: false,
};

describe("Settings dock and repository actions", () => {
    let browser: Browser;
    let page: Page;
    let server: ViteDevServer | undefined;
    let url: string;
    beforeAll(async () => {
        url = process.env.GG_SETTINGS_TEST_URL ?? "";
        if (!url) {
            server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
            await server.listen();
            url = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
        }
        browser = await chromium.launch({ headless: true, executablePath: process.env.GG_TEST_BROWSER || undefined });
        page = await browser.newPage();
        await page.route("**/api/**", async route => {
            let path = new URL(route.request().url()).pathname;
            let command = path.split("/").at(-1);
            if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
            let value: unknown = null;
            if (command === "query_workspace") value = workspace;
            else if (command === "query_log" || command === "query_log_next_page") value = { rows: [], has_more: false };
            else if (command === "query_recent_workspaces") value = [];
            else if (command === "query_current_status") value = workspace.status;
            else if (path.includes("/query/") && command !== "query_snapshot") return route.fulfill({ status: 500, body: "Revision unavailable in fixture" });
            await route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
        });
        if (process.env.GG_SETTINGS_SCREENSHOTS) await mkdir(process.env.GG_SETTINGS_SCREENSHOTS, { recursive: true });
    });
    afterAll(async () => { await browser?.close(); await server?.close(); });

    async function settings(width: number) {
        if (width < 768) await page.getByRole("button", { name: "Open repository navigation", exact: true }).click();
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.locator("#panel-tab-settings").waitFor();
        await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-settings");
    }

    it.each([
        { path: "/log?revset=all()", width: 1440 },
        { path: "/log?revset=all()", width: 390 },
        { path: "/revision?revset=fixture-unavailable", width: 1440 },
        { path: "/revision?revset=fixture-unavailable", width: 390 },
    ])("opens Settings from legacy $path at $width px and preserves browser Back", async ({ path, width }) => {
        await page.setViewportSize({ width, height: 960 });
        await page.goto(`${url}${path}`);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        let legacy = page.url();
        expect(await page.locator("#panel-tab-settings").count()).toBe(0);
        await settings(width);
        expect(new URL(page.url()).pathname).toBe("/");
        expect(new URL(page.url()).searchParams.get("panel")).toBe("settings");
        expect(await page.locator('[aria-label="Settings preferences"]').isVisible()).toBe(true);
        expect(await page.locator("#panel-tab-settings").count()).toBe(1);
        await page.goBack();
        expect(page.url()).toBe(legacy);
        await page.getByRole("button", { name: width < 768 ? "Open repository navigation" : "Settings", exact: true }).waitFor();
        expect(await page.locator("#panel-tab-settings").count()).toBe(0);
    });

    it.each([1440, 768, 390, 320])("opens, closes, focuses and preserves settings and toolbar access at %ipx", async width => {
        await page.setViewportSize({ width, height: 960 });
        await page.goto(`${url}/?inspect=fixture-unavailable`);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        let routeBefore = page.url();
        await settings(width);
        expect(page.url()).toBe(routeBefore);
        expect(await page.locator('[aria-label="Settings preferences"]').isVisible()).toBe(true);
        expect(await page.getByRole("heading", { name: "Browser zoom", exact: true }).isVisible()).toBe(true);
        expect(await page.getByRole("button", { name: "More repository actions", exact: true }).count()).toBe(0);
        expect(await page.getByRole("dialog", { name: "Repository navigation", exact: true, includeHidden: true }).count()).toBe(width < 768 ? 1 : 0);
        if (width < 768) expect(await page.getByRole("dialog", { name: "Repository navigation", exact: true }).isVisible()).toBe(false);
        for (let name of ["Fetch remote bookmarks", "Push all bookmarks", "Undo the latest operation", "Redo the latest undone operation", "Refresh repository", "Commands"]) {
            let button = page.getByRole("button", { name, exact: true });
            expect(await button.isVisible()).toBe(true);
            let box = (await button.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.height).toBeGreaterThanOrEqual(width <= 600 ? 44 : 28);
        }
        let remote = page.getByRole("combobox", { name: "Git remote", exact: true });
        expect(await remote.isVisible()).toBe(true);
        await remote.selectOption("upstream");
        expect(await remote.inputValue()).toBe("upstream");
        for (let theme of ["dark", "light"]) {
            await page.getByRole("button", { name: theme === "dark" ? "Twilight" : "Light", exact: true }).click();
            expect(await page.locator(`#shell.${theme}`).count()).toBe(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            if (process.env.GG_SETTINGS_SCREENSHOTS) await page.screenshot({ animations: "disabled", path: `${process.env.GG_SETTINGS_SCREENSHOTS}/settings-${width}-${theme}.png` });
        }
        await settings(width);
        expect(await page.locator("#panel-tab-settings").count()).toBe(1);
        await page.locator("#panel-tab-settings").hover();
        await page.getByRole("button", { name: "Close Settings", exact: true }).click();
        expect(await page.locator("#panel-tab-settings").count()).toBe(0);
        await settings(width);
        await page.getByRole("button", { name: "Twilight", exact: true }).click();
        await page.reload();
        await page.locator("#panel-tab-settings").waitFor();
        expect(await page.locator("#shell.dark").count()).toBe(1);
        expect(await page.getByRole("button", { name: "Twilight", exact: true }).getAttribute("aria-pressed")).toBe("true");
        expect(page.url()).toBe(routeBefore);
        if (width >= 768) {
            if (await page.getByRole("button", { name: "Expand repository navigation", exact: true }).isVisible()) await page.getByRole("button", { name: "Expand repository navigation", exact: true }).click();
            if (process.env.GG_SETTINGS_SCREENSHOTS) await page.screenshot({ animations: "disabled", path: `${process.env.GG_SETTINGS_SCREENSHOTS}/settings-${width}-expanded.png` });
            let collapse = page.getByRole("button", { name: "Collapse repository navigation", exact: true });
            await collapse.click();
            let gear = page.getByRole("button", { name: "Settings", exact: true });
            let toggle = page.getByRole("button", { name: "Expand repository navigation", exact: true });
            expect((await gear.boundingBox())!.y).toBeLessThan((await toggle.boundingBox())!.y);
            await gear.focus(); await gear.press("Enter");
            expect(await page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-settings");
            if (process.env.GG_SETTINGS_SCREENSHOTS) await page.screenshot({ animations: "disabled", path: `${process.env.GG_SETTINGS_SCREENSHOTS}/settings-${width}-collapsed.png` });
        } else {
            await page.getByRole("button", { name: "Open repository navigation", exact: true }).click();
            if (process.env.GG_SETTINGS_SCREENSHOTS) await page.screenshot({ animations: "disabled", path: `${process.env.GG_SETTINGS_SCREENSHOTS}/settings-${width}-navigation.png` });
            await page.getByRole("button", { name: "Settings", exact: true }).focus();
            await page.getByRole("button", { name: "Settings", exact: true }).press("Enter");
            await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("panel-tab-settings");
        }
    });
});
