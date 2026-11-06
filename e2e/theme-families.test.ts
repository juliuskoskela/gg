import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

let workspace = { type: "Workspace", absolute_path: "/work/gg-plus", git_remotes: ["origin"], query_choices: { default: "all()" }, latest_query: "all()", theme_override: null, status: { operation_description: "Refine shared appearance", working_copy: { type: "CommitId", hex: "abc", prefix: "a", rest: "bc" }, can_redo: false }, mark_unpushed_bookmarks: true, track_recent_workspaces: false, ignore_immutable: false, has_external_diff_tool: false, has_external_merge_tool: false };
let families = ["cold", "neutral", "warm"];
let appearances = ["light", "twilight", "midnight"];
let reports: object[] = [];
let errors: string[] = [];

describe("coordinated theme families", () => {
    let browser: Browser;
    let server: ViteDevServer;
    let url: string;
    beforeAll(async () => {
        server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } }); await server.listen();
        url = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.GG_TEST_BROWSER || undefined });
        await mkdir("e2e/results/themes", { recursive: true });
    });
    afterAll(async () => { await writeFile("e2e/results/themes/contrast.json", JSON.stringify(reports, null, 2)); await browser?.close(); await server?.close(); });
    async function connect(page: Page) {
        page.setDefaultTimeout(10000);
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/**", async route => {
            let path = new URL(route.request().url()).pathname, command = path.split("/").at(-1);
            if (path === "/api/events") return route.fulfill({ contentType: "text/event-stream", body: ": fixture\n\n" });
            let value: unknown = null;
            if (command === "query_workspace") value = workspace;
            else if (command === "query_log" || command === "query_log_next_page") value = { rows: [], has_more: false };
            else if (command === "query_recent_workspaces") value = [];
            else if (command === "query_current_status") value = workspace.status;
            else if (path.includes("/query/") && command !== "query_snapshot") return route.fulfill({ status: 500, body: "Revision unavailable in fixture" });
            await route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
        });
    }
    async function settings(page: Page, width: number) {
        await page.setViewportSize({ width, height: 1000 }); await connect(page); await page.goto(`${url}/?panel=settings`);
        await page.evaluate(() => { localStorage.clear(); localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "settings", panels: ["settings"] }, compactActive: "settings" })); });
        await page.reload(); await page.getByRole("group", { name: "Color family", exact: true }).waitFor();
    }
    function label(value: string) { return value[0].toUpperCase() + value.slice(1); }
    async function measure(page: Page) {
        return page.evaluate(() => {
            let host = document.getElementById("shell")!;
            let probe = document.createElement("span"); host.append(probe);
            let canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
            let ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            function color(role: string) { probe.style.color = `var(--${role})`; let css = getComputedStyle(probe).color; ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); }
            function luminance(rgb: number[]) { let v = rgb.map(x => { let s = x / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; }
            function ratio(a: string, b: string) { let x = luminance(color(a)), y = luminance(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
            let roles = ["text", "muted", "accent", "positive", "negative", "warning", "diffs-token-comment", "diffs-token-string", "diffs-token-keyword", "diffs-token-constant", "diffs-token-function", "diffs-token-punctuation"];
            let pairs = roles.flatMap(foreground => ["surface", "raised", "input-surface", "popover-surface"].map(background => ({ foreground, background, ratio: ratio(foreground, background), minimum: 4.5 })));
            for (let i = 0; i < 8; i++) for (let background of ["surface", "selection-hover"]) pairs.push({ foreground: `lane-${i}`, background, ratio: ratio(`lane-${i}`, background), minimum: 4.5 });
            for (let fg of ["text", "muted"]) for (let bg of ["selection-bg", "selection-hover", "diff-addition", "diff-deletion"]) pairs.push({ foreground: fg, background: bg, ratio: ratio(fg, bg), minimum: 4.5 });
            pairs.push({ foreground: "faint", background: "input-surface", ratio: ratio("faint", "input-surface"), minimum: 4.5 });
            for (let bg of ["accent-solid", "accent-solid-hover", "accent-solid-pressed"]) pairs.push({ foreground: "text-on-accent", background: bg, ratio: ratio("text-on-accent", bg), minimum: 4.5 });
            pairs.push({ foreground: "focus-ring", background: "selection-bg", ratio: ratio("focus-ring", "selection-bg"), minimum: 3 });
            let result = { pairs, surface: color("surface"), ground: color("ground"), ink: color("text"), rule: color("rule"), surfaceLuminance: luminance(color("surface")), groundLuminance: luminance(color("ground")) };
            probe.remove(); return result;
        });
    }
    it.each([1440, 768, 390, 320])("supports all nine choices and shared token contrast at %ipx", async width => {
        let page = await browser.newPage({ reducedMotion: "reduce" }); await settings(page, width);
        for (let family of families) {
            let luminances = new Map<string, number>();
            for (let appearance of appearances) {
                await page.getByRole("button", { name: label(family), exact: true }).click();
                await page.getByRole("button", { name: label(appearance), exact: true }).click();
                await expect.poll(() => page.locator("#shell").getAttribute("data-theme-family")).toBe(family);
                expect(await page.getByRole("button", { name: label(appearance), exact: true }).getAttribute("aria-pressed")).toBe("true");
                let result = await measure(page); reports.push({ width, family, appearance, ...result }); luminances.set(appearance, result.surfaceLuminance);
                let failures = result.pairs.filter(pair => pair.ratio < pair.minimum);
                expect(failures, `${family} ${appearance}: ${JSON.stringify(failures)}`).toEqual([]);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                expect(await page.evaluate(() => document.documentElement.dataset.themeFamily)).toBe(family);
                if (width === 1440 || width === 390) await page.screenshot({ path: `e2e/results/themes/settings-${family}-${appearance}-${width}.png` });
            }
            expect(luminances.get("light")!).toBeGreaterThan(luminances.get("twilight")!);
            expect(luminances.get("twilight")!).toBeGreaterThan(luminances.get("midnight")!);
        }
        await page.reload(); await page.getByRole("button", { name: "Warm", exact: true }).waitFor();
        expect(await page.getByRole("button", { name: "Warm", exact: true }).getAttribute("aria-pressed")).toBe("true");
        expect(await page.getByRole("button", { name: "Midnight", exact: true }).getAttribute("aria-pressed")).toBe("true");
        expect(errors).toEqual([]); await page.close();
    });
    it("updates other windows and migrates existing light/dark preferences without changing the family", async () => {
        let context = await browser.newContext(); let a = await context.newPage(); await settings(a, 1440);
        await a.evaluate(() => { localStorage.setItem("gg.ui.theme", "dark"); localStorage.removeItem("gg.ui.theme.family"); localStorage.removeItem("gg.ui.theme.dark-depth"); }); await a.reload();
        expect(await a.getByRole("button", { name: "Warm", exact: true }).getAttribute("aria-pressed")).toBe("true");
        expect(await a.getByRole("button", { name: "Twilight", exact: true }).getAttribute("aria-pressed")).toBe("true");
        let b = await context.newPage(); await connect(b); await b.goto(`${url}/?panel=settings`); await b.getByRole("group", { name: "Color family", exact: true }).waitFor();
        await a.getByRole("button", { name: "Cold", exact: true }).click(); await a.getByRole("button", { name: "Midnight", exact: true }).click();
        await expect.poll(() => b.locator("#shell").getAttribute("data-theme-family")).toBe("cold");
        await expect.poll(() => b.getByRole("button", { name: "Midnight", exact: true }).getAttribute("aria-pressed")).toBe("true");
        await b.getByRole("button", { name: "Light", exact: true }).click(); await expect.poll(() => a.locator("#shell.light").count()).toBe(1);
        expect(await a.locator("#shell").getAttribute("data-dark-depth")).toBe("midnight");
        await context.close();
    });
    it("renders the production component gallery in all families and appearances", async () => {
        let page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" }); await connect(page); await page.goto(`${url}/?design-system`);
        for (let family of families) for (let appearance of appearances) {
            await page.getByRole("combobox", { name: "Color family", exact: true }).selectOption(family);
            if (appearance === "light") { if (await page.locator("#shell.dark").count()) await page.getByRole("button", { name: "Light theme", exact: true }).click(); }
            else { if (await page.locator("#shell.light").count()) await page.getByRole("button", { name: "Dark theme", exact: true }).click(); await page.getByRole("combobox", { name: "Dark depth", exact: true }).selectOption(appearance); }
            await page.locator("diffs-container").first().waitFor();
            await expect.poll(() => page.locator('diffs-container [data-line] span[style*="var(--diffs-token-keyword)"]').count()).toBeGreaterThan(0);
            expect(await page.locator("#shell").getAttribute("data-theme-family")).toBe(family);
            await page.screenshot({ path: `e2e/results/themes/gallery-${family}-${appearance}.png`, fullPage: true });
        }
        expect(errors).toEqual([]); await page.close();
    });
});
