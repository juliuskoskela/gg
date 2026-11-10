import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RevsResult } from "../app/messages/RevsResult";
import type { EvolutionPage } from "../app/messages/EvolutionPage";
import type { OperationPage } from "../app/messages/OperationPage";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("native history inspection", () => {
    let ctx: TestContext;
    let url: string;
    let versions: EvolutionPage;
    let operations: OperationPage;
    let errors: string[] = [];
    let mutations: string[] = [];
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await writeFile(join(ctx.tempDir, "history.ts"), "export let answer = 42;\n");
        url = await startGG(ctx);
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw new Error("Missing workspace");
        let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: config.status.working_copy };
        let selection = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
        if (selection.type !== "Detail") throw new Error("Missing working copy");
        for (let description of ["Initial parser implementation", "Refine parser state transitions"]) {
            await request("mutate/describe_revision", { mutation: { id: selection.headers[0].id, new_description: description, reset_author: false }, options: { ignore_immutable: false } });
        }
        selection = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
        if (selection.type !== "Detail") throw new Error("Missing rewritten working copy");
        versions = await request<EvolutionPage>("query/query_evolution", { id: selection.headers[0].id });
        operations = await request<OperationPage>("query/query_operation_history");
        ctx.page.on("pageerror", error => errors.push(error.message));
        ctx.page.on("request", request => { if (request.url().includes("/api/mutate/")) mutations.push(request.url()); });
        await mkdir("e2e/results/histories", { recursive: true });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${endpoint}: ${await response.text()}`);
        return response.json();
    }
    function currentOperation() { return execFileSync("jj", ["--ignore-working-copy", "--repository", ctx.tempDir, "op", "log", "--no-graph", "--limit", "1", "-T", "id"], { encoding: "utf8" }); }
    async function arrange(width: number, theme: string, panel = "description") {
        await ctx.page.setViewportSize({ width, height: 960 });
        await ctx.page.goto(`${url}/?inspect=@`);
        await ctx.page.evaluate(({ theme, panel }) => {
            localStorage.setItem("gg.ui.theme", theme);
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: panel, panels: [panel] }, compactActive: panel }));
        }, { theme, panel });
        await ctx.page.reload();
        await ctx.page.locator(`#panel-tab-${panel}`).waitFor();
    }
    let layouts = [1440, 768, 390, 320].flatMap(width => ["light", "dark"].map(theme => ({ width, theme })));
    it.each(layouts)("browses exact versions and past repository states in $theme at $width px", async ({ width, theme }) => {
        await arrange(width, theme);
        let before = currentOperation();
        await ctx.page.getByRole("button", { name: "Earlier versions of this change" }).click();
        let evolution = ctx.page.getByRole("region", { name: "Evolution", exact: true });
        await evolution.getByRole("button", { name: /Initial parser implementation/ }).waitFor();
        await evolution.getByRole("button", { name: /Initial parser implementation/ }).click();
        await expect.poll(() => evolution.getByRole("heading", { level: 2 }).textContent()).toBe("Initial parser implementation");
        await evolution.getByRole("combobox", { name: "Version file" }).waitFor();
        await expect.poll(() => evolution.locator("diffs-container").evaluateAll(nodes => nodes.map(node => node.shadowRoot?.textContent ?? "").join(""))).toContain("answer");
        let commit = versions.entries.find(entry => entry.revision.description.lines[0] === "Initial parser implementation")!.revision.id.commit.hex;
        expect(await evolution.locator("dl[aria-label='Version metadata'] dd").allTextContents()).toContain(commit.slice(0, 12));
        let first = evolution.getByRole("button", { name: /Refine parser state transitions/ });
        await first.focus();
        await ctx.page.keyboard.press("ArrowDown");
        expect(await evolution.getByRole("button", { name: /Initial parser implementation/ }).getAttribute("aria-pressed")).toBe("true");
        await ctx.page.screenshot({ path: `e2e/results/histories/evolution-${theme}-${width}.png` });
        if (width < 768) await ctx.page.getByRole("button", { name: "Open repository navigation", exact: true }).click();
        await ctx.page.getByRole("button", { name: "Repository history", exact: true }).click();
        let history = ctx.page.getByRole("region", { name: "Repository history", exact: true });
        await history.getByRole("button", { name: /describe commit/ }).first().waitFor();
        let previous = operations.entries.find(entry => entry.id !== operations.head_id)!;
        await history.locator("button[data-log-row]").nth(1).click();
        await expect.poll(() => history.locator("dl[aria-label='Operation metadata'] dd").first().textContent()).toBe(previous.id.slice(0, 12));
        await history.getByRole("region", { name: "Historical graph" }).waitFor();
        expect(await history.getByRole("region", { name: "Historical workspaces" }).textContent()).toContain("default");
        expect(await history.getByRole("region", { name: "Historical bookmarks" }).textContent()).toContain("main");
        await ctx.page.screenshot({ path: `e2e/results/histories/operations-${theme}-${width}.png` });
        await history.locator(".revision-row button").first().click();
        await history.getByRole("button", { name: "Back to state", exact: true }).waitFor();
        await history.getByRole("combobox", { name: "Version file" }).waitFor();
        await history.getByRole("button", { name: "Back to state", exact: true }).click();
        await history.getByRole("region", { name: "Historical graph" }).waitFor();
        expect(currentOperation()).toBe(before);
        expect(mutations).toEqual([]);
        expect(errors).toEqual([]);
        expect(await ctx.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    it("recovers from an operation error and ignores a superseded detail response", async () => {
        await arrange(1440, "dark", "history");
        let history = ctx.page.getByRole("region", { name: "Repository history", exact: true });
        await history.locator("button[data-log-row]").nth(1).waitFor();
        await history.getByRole("region", { name: "Historical graph" }).waitFor();
        let failed = false;
        await ctx.page.route("**/api/query/query_operation_detail", async route => {
            if (!failed) { failed = true; await route.fulfill({ status: 500, body: "Operation temporarily unavailable" }); }
            else await route.continue();
        });
        await history.locator("button[data-log-row]").nth(1).click();
        await history.getByRole("button", { name: "Retry operation" }).waitFor();
        await history.getByRole("button", { name: "Retry operation" }).click();
        await history.getByRole("region", { name: "Historical graph" }).waitFor();
        await ctx.page.unroute("**/api/query/query_operation_detail");
        let release: (() => void) | undefined;
        let started = false;
        let waiting = new Promise<void>(resolve => release = resolve);
        await ctx.page.route("**/api/query/query_operation_detail", async route => {
            let id = route.request().postDataJSON().id;
            if (id === operations.entries[0].id) { started = true; await waiting; }
            await route.continue();
        });
        await history.locator("button[data-log-row]").first().click();
        await expect.poll(() => started).toBe(true);
        await history.locator("button[data-log-row]").nth(1).click();
        await expect.poll(() => history.locator("dl[aria-label='Operation metadata'] dd").first().textContent()).toBe(operations.entries[1].id.slice(0, 12));
        let completed = ctx.page.waitForResponse(response => response.url().endsWith("/query_operation_detail") && response.request().postDataJSON().id === operations.entries[0].id);
        release!();
        await completed;
        await ctx.page.unrouteAll({ behavior: "wait" });
        await ctx.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect.poll(() => history.locator("dl[aria-label='Operation metadata'] dd").first().textContent()).toBe(operations.entries[1].id.slice(0, 12));
        expect(errors).toEqual([]);
    });
    it("keeps text-field focus to a single neutral stroke and themes the resize corner", async () => {
        await request("mutate/describe_revision", { mutation: { id: versions.entries[0].revision.id, new_description: "", reset_author: false }, options: { ignore_immutable: false } });
        for (let theme of ["light", "dark"]) {
            await arrange(1440, theme);
            let field = ctx.page.getByRole("textbox", { name: "Revision description", exact: true });
            await field.waitFor(); await field.focus();
            await field.evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
            let style = await field.evaluate(node => { let css = getComputedStyle(node); let corner = getComputedStyle(node, "::-webkit-resizer"); return { outline: css.outlineStyle, border: css.borderColor, width: css.borderWidth, bg: css.backgroundColor, cornerBg: corner.backgroundColor, cornerImage: corner.backgroundImage }; });
            expect(style.outline).toBe("none"); expect(style.width).toBe("1px");
            expect(style.cornerImage).toContain("linear-gradient");
            expect(style.cornerBg).toBe(style.bg);
            let contrast = await field.evaluate(node => {
                let context = document.createElement("canvas").getContext("2d")!;
                function luminance(color: string) { context.fillStyle = color; context.fillRect(0, 0, 1, 1); let [r, g, b] = context.getImageData(0, 0, 1, 1).data; let channels = [r, g, b].map(channel => { let v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; }
                let css = getComputedStyle(node); let a = luminance(css.borderColor), b = luminance(css.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            });
            expect(contrast).toBeGreaterThanOrEqual(3);
            await ctx.page.screenshot({ path: `e2e/results/histories/description-focus-${theme}.png` });
        }
    });
    it("pages earlier operations and versions without changing the repository", async () => {
        for (let index = 0; index < 42; index++) await request("mutate/describe_revision", { mutation: { id: versions.entries[0].revision.id, new_description: `Retained version ${index}`, reset_author: false }, options: { ignore_immutable: false } });
        await arrange(1440, "dark", "history");
        let history = ctx.page.getByRole("region", { name: "Repository history", exact: true });
        await history.getByRole("button", { name: "Load earlier entries" }).waitFor();
        expect(await history.locator("button[data-log-row]").count()).toBe(40);
        let head = currentOperation();
        await history.getByRole("button", { name: "Load earlier entries" }).click();
        await expect.poll(() => history.locator("button[data-log-row]").count()).toBeGreaterThan(40);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Evolution", exact: true }).click();
        let evolution = ctx.page.getByRole("region", { name: "Evolution", exact: true });
        await evolution.getByRole("button", { name: "Load earlier entries" }).waitFor();
        expect(await evolution.locator("button[data-log-row]").count()).toBe(40);
        await evolution.getByRole("button", { name: "Load earlier entries" }).click();
        await expect.poll(() => evolution.locator("button[data-log-row]").count()).toBeGreaterThan(40);
        expect(currentOperation()).toBe(head);
        expect(errors).toEqual([]);
    });

    it.each(["light", "dark"])("expands the tab pill to reveal its close icon in %s", async theme => {
        await arrange(1440, theme);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "description", panels: ["description", "history"] }, compactActive: "description" })));
        await ctx.page.reload();
        let close = ctx.page.getByRole("button", { name: "Close History", exact: true });
        let tab = ctx.page.locator("#panel-tab-history");
        await close.waitFor({ state: "attached" });
        await ctx.page.getByRole("button", { name: "Views", exact: true }).focus();
        await ctx.page.mouse.move(0, 0);
        await expect.poll(() => close.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
        let pill = tab.locator("..");
        let before = (await tab.boundingBox())!;
        let collapsed = (await pill.boundingBox())!;
        expect(await close.evaluate(node => node.getBoundingClientRect().width)).toBe(0);
        expect(collapsed.width - before.width).toBe(6);
        await ctx.page.screenshot({ path: `e2e/results/histories/tab-pill-${theme}-rest.png` });
        await tab.hover();
        await expect.poll(() => close.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        await expect.poll(async () => (await close.boundingBox())!.width).toBe(24);
        await expect.poll(async () => Math.round((await pill.boundingBox())!.width - collapsed.width)).toBe(20);
        expect((await tab.boundingBox())!.x).toBe(before.x);
        expect((await tab.boundingBox())!.width).toBe(before.width);
        await close.hover();
        expect(await close.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
        await ctx.page.screenshot({ path: `e2e/results/histories/tab-pill-${theme}-hover.png` });
        let label = (await tab.locator("span").last().boundingBox())!;
        let icon = (await close.locator("svg").boundingBox())!;
        expect(icon.x - (label.x + label.width)).toBeGreaterThanOrEqual(3);
        expect(icon.x - (label.x + label.width)).toBeLessThanOrEqual(5);
        await ctx.page.mouse.move(0, 0);
        await expect.poll(async () => Math.round((await pill.boundingBox())!.width)).toBe(Math.round(collapsed.width));
        await tab.click();
        await ctx.page.mouse.move(0, 0);
        await expect.poll(() => close.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
        await tab.focus();
        await ctx.page.keyboard.press("Tab");
        await expect.poll(() => close.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        await close.focus();
        await ctx.page.keyboard.press("Enter");
        expect(await ctx.page.locator("#panel-tab-history").count()).toBe(0);
        let singleClose = ctx.page.getByRole("button", { name: "Close Description", exact: true });
        await ctx.page.getByRole("button", { name: "Views", exact: true }).focus();
        await ctx.page.mouse.move(0, 0);
        await expect.poll(() => singleClose.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
        await ctx.page.locator("#panel-tab-description").hover();
        await expect.poll(() => singleClose.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        let singleLabel = (await ctx.page.locator("#panel-tab-description span").last().boundingBox())!;
        let singleIcon = (await singleClose.locator("svg").boundingBox())!;
        expect(singleIcon.x - (singleLabel.x + singleLabel.width)).toBeGreaterThanOrEqual(3);
        expect(singleIcon.x - (singleLabel.x + singleLabel.width)).toBeLessThanOrEqual(5);
        await ctx.page.setViewportSize({ width: 390, height: 960 });
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root: { type: "tabs", active: "description", panels: ["description", "history"] }, compactActive: "description" })));
        await ctx.page.reload();
        await ctx.page.getByRole("button", { name: "Close History", exact: true }).waitFor();
        expect(await ctx.page.getByRole("button", { name: "Close History", exact: true }).evaluate(node => getComputedStyle(node).opacity)).toBe("1");
        expect(errors).toEqual([]);
    });

});
