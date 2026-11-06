import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// the fixture uses only in-memory file contents; no repository or backend is opened.
describe("diff fold interactions", () => {
    let server: ViteDevServer;
    let browser: Browser;
    let url: string;
    beforeAll(async () => {
        server = await createServer({
            server: { port: 0, strictPort: false },
            plugins: [{ name: "diff-fold-fixture", configureServer(vite) {
                vite.middlewares.use("/__diff-folding", (_request, response) => {
                    response.setHeader("Content-Type", "text/html");
                    response.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="shell"></div><script type="module" src="/e2e/fixtures/diff-folding.ts"></script></body></html>');
                });
            } }],
        });
        await server.listen();
        let address = server.httpServer!.address();
        if (!address || typeof address === "string") throw Error("Missing fixture port");
        url = `http://localhost:${address.port}/__diff-folding`;
        browser = await chromium.launch({ executablePath: process.env.GG_TEST_BROWSER || undefined, headless: true });
        await mkdir(resolve("e2e/results/diff-folding"), { recursive: true });
    });
    afterAll(async () => { await browser?.close(); await server?.close(); });

    async function text(page: Page) {
        return page.locator("diffs-container").evaluate(node => node.shadowRoot?.querySelector("pre")?.textContent ?? "");
    }
    for (let theme of ["light", "dark"]) for (let layout of [{ width: 1440, style: "split" }, { width: 390, style: "unified" }]) {
        it(`repeatedly expands and collapses every block in ${theme} at ${layout.width}px`, async () => {
            let page = await browser.newPage({ viewport: { width: layout.width, height: 760 } });
            try {
                await page.goto(`${url}?theme=${theme}&style=${layout.style}`);
                await expect.poll(() => page.getByRole("button", { name: "Expand 105 unmodified lines", exact: true }).count()).toBe(layout.style === "split" ? 2 : 1);
                let hunks = await page.evaluate("window.diffFixtureHunks");
                let reader = page.locator("#reader");
                await reader.evaluate(node => node.scrollTop = 60);
                for (let [lines, hiddenText] of [[105, "context34"], [28, "context1 ="], [37, "context180"]] as const) {
                    for (let repeat = 0; repeat < 2; repeat++) {
                        // the trailing count is unknown until the first hydration.
                        let expand = page.getByRole("button", { name: `Expand ${lines} unmodified lines`, exact: true }).first();
                        await expand.scrollIntoViewIfNeeded();
                        let before = (await expand.boundingBox())!;
                        if (layout.width <= 600) expect(before.height).toBeGreaterThanOrEqual(44);
                        let svg = (await expand.locator("svg").boundingBox())!;
                        expect(svg.x).toBeGreaterThanOrEqual(before.x);
                        expect(svg.x + svg.width).toBeLessThanOrEqual(before.x + before.width);
                        await expand.hover();
                        expect(await expand.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
                        // exercise native keyboard activation and focus restoration as well as pointer clicks.
                        if (repeat === 0) { await expand.focus(); await page.keyboard.press("Enter"); } else await expand.click();
                        let collapse = page.getByRole("button", { name: `Collapse ${lines} unmodified lines`, exact: true }).first();
                        await expect.poll(() => collapse.count()).toBe(1);
                        await expect.poll(async () => Math.abs((await collapse.boundingBox())!.y - before.y)).toBeLessThan(2);
                        await expect.poll(() => text(page)).toContain(hiddenText);
                        if (repeat === 0) await expect.poll(() => collapse.evaluate(node => node === document.activeElement)).toBe(true);
                        // other gaps stay folded while this block is open.
                        expect(await page.getByRole("button", { name: /^Collapse / }).count()).toBe(layout.style === "split" ? 2 : 1);
                        if (repeat === 0) await page.screenshot({ path: resolve(`e2e/results/diff-folding/${theme}-${layout.width}-${lines}-expanded.png`) });
                        if (repeat === 0) await page.keyboard.press("Space"); else await collapse.click();
                        await expect.poll(() => page.getByRole("button", { name: `Expand ${lines} unmodified lines`, exact: true }).count()).toBe(layout.style === "split" ? 2 : 1);
                        await expect.poll(async () => Math.abs((await expand.boundingBox())!.y - before.y)).toBeLessThan(2);
                        await expect.poll(() => text(page)).not.toContain(hiddenText);
                    }
                }
                for (let lines of [28, 105, 37]) await page.getByRole("button", { name: `Expand ${lines} unmodified lines`, exact: true }).first().click();
                await expect.poll(() => page.getByRole("button", { name: /^Collapse / }).count()).toBe(layout.style === "split" ? 6 : 3);
                await page.getByRole("button", { name: "Collapse 105 unmodified lines", exact: true }).first().click();
                await expect.poll(() => page.getByRole("button", { name: /^Collapse / }).count()).toBe(layout.style === "split" ? 4 : 2);
                expect(await text(page)).toContain("context1 =");
                expect(await text(page)).toContain("context180");
                expect(await text(page)).not.toContain("context34");
                for (let lines of [28, 37]) await page.getByRole("button", { name: `Collapse ${lines} unmodified lines`, exact: true }).first().click();
                expect(await page.locator("body").getAttribute("data-loads")).toBe("1");
                expect(await page.evaluate("window.diffFixtureHunks")).toBe(hunks);
                await page.screenshot({ path: resolve(`e2e/results/diff-folding/${theme}-${layout.width}-collapsed.png`) });
                await page.getByRole("button", { name: "Show all context", exact: true }).click();
                await expect.poll(() => text(page)).toContain("context180");
                expect(await text(page)).toContain("context1 =");
                expect(await page.locator(".diff-fold").count()).toBe(0);
                expect(await page.evaluate("window.diffFixtureHunks")).toBe(hunks);
            } finally { await page.close(); }
        });
    }
});
