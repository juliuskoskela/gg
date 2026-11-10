import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, openChangedFiles, startGG, type TestContext } from "./harness.js";

function revset(expression: string) {
    let id = { change: { type: "ChangeId", hex: expression, prefix: expression, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
    return { from: id, to: id };
}

describe("workspace complex-state acceptance", () => {
    let ctx: TestContext;
    beforeEach(async () => { ctx = await createContext(); extractTestRepo(ctx.tempDir); await ctx.page.setViewportSize({ width: 390, height: 844 }); });
    afterEach(async () => destroyContext(ctx));

    it("restores the exact commit when two visible revisions share a change ID", async () => {
        // Separate operation branches deliberately rewrite the same source change.
        let run = (...args: string[]) => execFileSync("jj", ["--no-pager", ...args], { cwd: ctx.tempDir, encoding: "utf8", env: { ...process.env, XDG_CONFIG_HOME: join(ctx.tempDir, ".jj", "test-config") }, stdio: ["ignore", "pipe", "pipe"] }).trim();
        let op = run("op", "log", "--no-graph", "-n", "1", "-T", "id");
        run("describe", "-r", "wnpusytq", "-m", "Divergent version one");
        run("--at-op", op, "describe", "-r", "wnpusytq", "-m", "Divergent version two");
        let lines = run("log", "-r", "divergent()", "--no-graph", "-T", 'change_id ++ " " ++ commit_id ++ " " ++ description.first_line() ++ "\\n"').split("\n").filter(line => line.includes("Divergent version"));
        expect(lines).toHaveLength(2);
        let entries = lines.map(line => { let [change, commit, ...description] = line.split(" "); return { change, commit, description: description.join(" ") }; });
        expect(entries[0].change).toBe(entries[1].change);
        expect(entries[0].commit).not.toBe(entries[1].commit);
        let base = await startGG(ctx);
        for (let entry of entries) {
            await ctx.page.goto(`${base}/?inspect=${entry.commit}`);
            await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain(entry.description);
            expect(new URL(ctx.page.url()).searchParams.get("inspect")).toBe(entry.commit);
            await ctx.page.reload();
            await expect.poll(() => ctx.page.locator(".description-panel").textContent()).toContain(entry.description);
            expect(new URL(ctx.page.url()).searchParams.get("inspect")).toBe(entry.commit);
        }
    });

    it("restores both exact commit endpoints of a historical range", async () => {
        let base = await startGG(ctx);
        let query = async (expression: string) => {
            let response = await fetch(`${base}/api/query/query_revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: revset(expression), client_id: "range-acceptance" }) });
            return response.json();
        };
        await fetch(`${base}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir, client_id: "range-acceptance" }) });
        let from = (await query("@--")).headers[0].id.commit.hex as string;
        let to = (await query("@-")).headers[0].id.commit.hex as string;
        expect(from).not.toBe(to);
        let seen: Array<{ from: string; to: string; headers: string[] }> = [];
        let onResponse = async (response: import("@playwright/test").Response) => {
            if (!response.url().includes("/api/query/query_revision_summary") || !response.ok()) return;
            try {
                let req = response.request().postDataJSON();
                let result = await response.json();
                if (result.type === "Detail") seen.push({ from: req.set.from.change.hex, to: req.set.to.change.hex, headers: result.headers.map((header: any) => header.id.commit.hex) });
            } catch { /* navigation may cancel an obsolete response */ }
        };
        ctx.page.on("response", onResponse);
        await ctx.page.goto(`${base}/?inspect=${to}&inspectFrom=${from}`);
        await expect.poll(() => seen.some(value => value.from === from && value.to === to && value.headers.includes(from) && value.headers.includes(to))).toBe(true);
        await ctx.page.reload();
        await expect.poll(() => new URL(ctx.page.url()).searchParams.get("inspectFrom")).toBe(from);
        expect(new URL(ctx.page.url()).searchParams.get("inspect")).toBe(to);
        await expect.poll(() => seen.filter(value => value.from === from && value.to === to).length).toBeGreaterThanOrEqual(2);
        ctx.page.off("response", onResponse);
    });

    it("exposes deleted and binary files as distinct changes through the real reader", async () => {
        unlinkSync(join(ctx.tempDir, "a.txt"));
        writeFileSync(join(ctx.tempDir, "binary.bin"), Buffer.from([0, 1, 2, 3, 255, 0, 7]));
        let base = await startGG(ctx);
        await ctx.page.goto(base);
        await ctx.page.locator(".graph .selection-item").first().click();
        let drawer = await openChangedFiles(ctx.page);
        await expect.poll(() => drawer.textContent()).toContain("a.txt");
        await expect.poll(() => drawer.textContent()).toContain("binary.bin");
        await drawer.getByRole("searchbox", { name: "Filter changed files" }).fill("binary.bin");
        await drawer.getByRole("option", { name: "binary.bin" }).click();
        await ctx.page.getByRole("region", { name: "File diff" }).getByText(/binary/i).first().waitFor();
        let response = await fetch(`${base}/api/query/query_revision_summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: revset("@"), client_id: "complex-fixture" }) });
        let summary = await response.json();
        expect(summary.changes.find((c: any) => c.path.repo_path === "a.txt")?.kind).toBe("Deleted");
        expect(summary.changes.find((c: any) => c.path.repo_path === "binary.bin")?.kind).toBe("Added");
    });

    it("loads the bundled faces and keeps phone text and inputs readable at 320px", async () => {
        await ctx.page.setViewportSize({ width: 320, height: 800 });
        await ctx.page.goto(await startGG(ctx));
        let row = ctx.page.locator(".graph .selection-item").filter({ hasText: "rename c.txt" }).first();
        await row.click();
        await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).waitFor();
        let metrics = await ctx.page.evaluate(async () => {
            let loaded = await Promise.all([document.fonts.load('400 14px "IBM Plex Sans"'), document.fonts.load('500 14px "IBM Plex Sans"'), document.fonts.load('400 13px "JetBrains Mono"'), document.fonts.load('500 13px "JetBrains Mono"')]);
            let input = document.querySelector<HTMLInputElement>('[aria-label="Filter revisions with a revset"]')!;
            return { loaded: loaded.map(faces => faces.some(face => face.status === "loaded")), ui: getComputedStyle(document.querySelector(".graph .desc")!).fontSize, input: getComputedStyle(input).fontSize, width: document.documentElement.scrollWidth };
        });
        expect(metrics.loaded).toEqual([true, true, true, true]);
        expect(parseFloat(metrics.ui)).toBeGreaterThanOrEqual(14);
        expect(parseFloat(metrics.input)).toBeGreaterThanOrEqual(16);
        expect(metrics.width).toBeLessThanOrEqual(320);
        await ctx.page.getByRole("tab", { name: "Diff", exact: true }).click();
        let code = ctx.page.locator('.diff-viewer [data-overflow="scroll"] [data-code]:not([data-diffs-scrollbar-measure])').first();
        await code.waitFor();
        expect(parseFloat(await code.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
    });

    it("keeps keyboard focus visible and reachable in a 320px compact workspace", async () => {
        await ctx.page.setViewportSize({ width: 320, height: 640 });
        await ctx.page.goto(await startGG(ctx));
        await ctx.page.locator(".graph .selection-item").first().click();
        await ctx.page.getByRole("tab", { name: "Timeline", exact: true }).focus();
        await ctx.page.keyboard.press("Tab");
        let checked = 0;
        for (let i = 0; i < 8; i++) {
            let state = await ctx.page.evaluate(async () => {
                let element = document.activeElement as HTMLElement;
                await Promise.all(element.getAnimations().map(animation => animation.finished));
                let box = element.getBoundingClientRect();
                let style = getComputedStyle(element);
                let ring = getComputedStyle(element, "::before");
                let insetFocus = element.matches(":focus-visible") && ring.content !== "none" && ring.borderStyle === "solid" && parseFloat(ring.borderWidth) >= 2;
                let fieldFocus = false;
                let fieldDiagnostic: unknown = { visible: element.matches(":focus-visible"), border: style.borderColor, background: style.backgroundColor };
                if (element.matches("input:focus-visible, textarea:focus-visible, select:focus-visible")) {
                    let border = style.borderColor, background = style.backgroundColor;
                    element.blur();
                    await Promise.all(element.getAnimations().map(animation => animation.finished));
                    let restingBorder = getComputedStyle(element).borderColor;
                    element.focus({ preventScroll: true });
                    await Promise.all(element.getAnimations().map(animation => animation.finished));
                    let canvas = document.createElement("canvas").getContext("2d")!;
                    let luminance = (color: string) => {
                        canvas.fillStyle = color; canvas.fillRect(0, 0, 1, 1);
                        let channels = [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
                            let value = channel / 255;
                            return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
                        });
                        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
                    };
                    let a = luminance(border), b = luminance(background);
                    let ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
                    fieldDiagnostic = { border, restingBorder, ratio };
                    fieldFocus = border !== restingBorder && ratio >= 3;
                }
                return { fieldFocus, fieldDiagnostic, tag: element.tagName, name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80), width: box.width, height: box.height, top: box.top, bottom: box.bottom, left: box.left, right: box.right, inert: !!element.closest("[inert], [aria-hidden=true]"), outline: style.outlineStyle, shadow: style.boxShadow, insetFocus };
            });
            if (state.tag === "BODY") break; // Tab may leave document for browser chrome.
            checked++;
            expect(state.inert).toBe(false);
            expect(state.width).toBeGreaterThan(0);
            expect(state.height).toBeGreaterThan(0);
            expect(state.top).toBeLessThan(640);
            expect(state.bottom).toBeGreaterThan(0);
            expect(state.left).toBeLessThan(320);
            expect(state.right).toBeGreaterThan(0);
            expect(state.outline !== "none" || state.shadow !== "none" || state.insetFocus || state.fieldFocus, JSON.stringify(state)).toBe(true);
            await ctx.page.keyboard.press("Tab");
        }
        expect(checked).toBeGreaterThanOrEqual(3);
    });

});
