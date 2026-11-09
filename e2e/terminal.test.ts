import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";

describe("workspace terminal", () => {
    let ctx: TestContext;
    let url: string;
    let token: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        // exercise the managed Bash startup and line editor through real key events.
        let shell = process.env.SHELL;
        if (process.platform !== "win32") process.env.SHELL = "bash";
        let started = startGG(ctx);
        if (shell === undefined) delete process.env.SHELL;
        else process.env.SHELL = shell;
        url = await started;
        await ctx.page.goto(url);
        token = await ctx.page.evaluate(() => (window as Window & { __GG_TERMINAL_TOKEN__: string }).__GG_TERMINAL_TOKEN__);
        await ctx.page.evaluate(() => localStorage.setItem("gg.dock.layout", JSON.stringify({
            version: 1, root: { type: "tabs", active: "terminal", panels: ["terminal", "timeline"] }, compactActive: "terminal",
        })));
        await mkdir("e2e/results/terminal", { recursive: true });
        await ctx.page.reload();
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    function screen() { return ctx.page.locator(".screen-reader-only"); }
    async function command(text: string) {
        await ctx.page.getByRole("textbox", { name: /^Workspace terminal/ }).focus();
        await ctx.page.getByRole("textbox", { name: /^Workspace terminal/ }).evaluate((node, text) => {
            let clipboardData = new DataTransfer();
            clipboardData.setData("text/plain", text);
            node.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
        }, text);
        await ctx.page.keyboard.press("Enter");
    }

    it("runs a shell at the workspace root and preserves it across dock moves", async () => {
        await ctx.page.setViewportSize({ width: 1440, height: 960 });
        await ctx.page.getByRole("textbox", { name: /^Workspace terminal/ }).waitFor();
        await expect.poll(() => screen().textContent()).not.toBe("");
        await ctx.page.getByRole("textbox", { name: /^Workspace terminal/ }).focus();
        await ctx.page.keyboard.type("export GG_TERMINAL_TEST=kept; printf '\\nROOT=%s\\n' \"$PWD\"");
        await ctx.page.keyboard.press("Enter");
        await expect.poll(() => screen().textContent()).toContain(`ROOT=${ctx.tempDir}`);
        await ctx.page.locator("#panel-tab-timeline").click();
        await ctx.page.locator("#panel-tab-terminal").click();
        // the public dock controller is exercised through the actual draggable tab.
        let terminal = ctx.page.locator("#panel-tab-terminal");
        let target = ctx.page.locator("#panel-tab-timeline");
        await terminal.dragTo(target);
        await command("printf '\\nSESSION=%s\\n' \"$GG_TERMINAL_TEST\"");
        await expect.poll(() => screen().textContent()).toContain("SESSION=kept");
        await ctx.page.keyboard.press("Control+Shift+F6");
        await expect.poll(() => ctx.page.locator("#terminal-restart button").evaluate(node => node === document.activeElement)).toBe(true);
    });

    it("completes filenames with Tab and keeps history and cursor editing in the shell", async () => {
        await writeFile(join(ctx.tempDir, "gg-tab-completion.txt"), "");
        let input = ctx.page.getByRole("textbox", { name: /^Workspace terminal/ });
        await input.focus();
        await ctx.page.keyboard.type("printf '\\nCOMPLETED:%s\\n' gg-tab-comp");
        await ctx.page.keyboard.press("Tab");
        expect(await input.evaluate(node => node === document.activeElement)).toBe(true);
        await ctx.page.keyboard.press("Enter");
        await expect.poll(() => screen().textContent()).toContain("COMPLETED:gg-tab-completion.txt");
        let count = (text: string | null) => text?.split("COMPLETED:gg-tab-completion.txt").length ?? 0;
        let previous = count(await screen().textContent());
        await ctx.page.keyboard.press("ArrowUp");
        await ctx.page.keyboard.press("Enter");
        await expect.poll(async () => count(await screen().textContent())).toBeGreaterThan(previous);
        await ctx.page.keyboard.type("printf '\\nEDITED:%s\\n' ac");
        await ctx.page.keyboard.press("ArrowLeft");
        await ctx.page.keyboard.type("b");
        await ctx.page.keyboard.press("Enter");
        await expect.poll(() => screen().textContent()).toContain("EDITED:abc");
    });

    it("refreshes repository state after shell writes and handles resize and shell exit", async () => {
        let snapshot = ctx.page.waitForResponse(response => response.url().endsWith("/api/query/query_snapshot"));
        await command("printf 'from terminal\\n' > terminal-result.txt");
        await snapshot;
        expect(await readFile(join(ctx.tempDir, "terminal-result.txt"), "utf8")).toBe("from terminal\n");
        await ctx.page.setViewportSize({ width: 768, height: 760 });
        await command("stty size; printf '\\nUNICODE: λ 雪\\n'");
        await expect.poll(() => screen().textContent()).toContain("UNICODE: λ 雪");
        await ctx.page.screenshot({ path: "e2e/results/terminal/768.png" });
        await command("exit 7");
        await expect.poll(() => ctx.page.getByRole("status").allTextContents()).toContain("Shell exited with code 7.");
        await ctx.page.getByRole("button", { name: "Start a new shell", exact: true }).click();
        await command("printf '\\nNEW=%s\\n' \"${GG_TERMINAL_TEST-unset}\"");
        await expect.poll(() => screen().textContent()).toContain("NEW=unset");
    });

    it.each(["light", "dark"])("renders in %s with colour-vision tokens", async theme => {
        await ctx.page.evaluate(theme => {
            let shell = document.getElementById("shell")!;
            shell.dataset.theme = theme;
            shell.style.colorScheme = theme;
            shell.dataset.colorVision = "deutan";
        }, theme);
        await expect.poll(() => ctx.page.locator(".terminal-host canvas").evaluate(node => {
            let canvas = node as HTMLCanvasElement;
            let drawn = [...canvas.getContext("2d")!.getImageData(10, canvas.height - 10, 1, 1).data];
            let probe = document.createElement("span");
            probe.style.color = "var(--surface)";
            node.parentElement!.append(probe);
            let expected = document.createElement("canvas").getContext("2d")!;
            expected.fillStyle = getComputedStyle(probe).color;
            expected.fillRect(0, 0, 1, 1);
            probe.remove();
            return drawn.join() === [...expected.getImageData(0, 0, 1, 1).data].join();
        })).toBe(true);
        for (let width of [1440, 390]) {
            await ctx.page.setViewportSize({ width, height: 900 });
            await command("printf '\\033[31mred \\033[32mgreen \\033[33myellow \\033[34mblue \\033[35mmagenta \\033[36mcyan\\033[0m\\n'");
            await expect.poll(() => screen().textContent()).toContain("magenta");
            await ctx.page.screenshot({ path: `e2e/results/terminal/${theme}-${width}.png` });
            expect(await ctx.page.locator("body").evaluate(node => node.scrollWidth <= window.innerWidth)).toBe(true);
        }
    });

    it.each([
        { name: "missing token", credential: "", origin: "same" },
        { name: "invalid token", credential: "wrong", origin: "same" },
        { name: "cross-origin", credential: "valid", origin: "https://attacker.example" },
        { name: "missing origin", credential: "valid", origin: "" },
    ])("rejects $name WebSocket requests", async test => {
        let endpoint = new URL("/api/terminal", url);
        endpoint.protocol = "ws:";
        endpoint.searchParams.set("directory", ctx.tempDir);
        endpoint.searchParams.set("token", test.credential === "valid" ? token : test.credential);
        let status = await new Promise<number>((resolve, reject) => {
            let socket = new WebSocket(endpoint, { origin: test.origin === "same" ? url : test.origin || undefined });
            socket.on("unexpected-response", (_request, response) => { resolve(response.statusCode!); response.resume(); socket.terminate(); });
            socket.on("open", () => { socket.close(); reject(new Error("Unauthorized socket opened")); });
            socket.on("error", () => {});
        });
        expect(status).toBe(403);
    });

    it("rejects a directory outside the loaded workspace", async () => {
        let endpoint = new URL("/api/terminal", url);
        endpoint.protocol = "ws:";
        endpoint.searchParams.set("token", token);
        endpoint.searchParams.set("directory", "/");
        let message = await new Promise<{ type: string; message: string }>((resolve, reject) => {
            let socket = new WebSocket(endpoint, { origin: url });
            socket.on("message", data => { resolve(JSON.parse(data.toString())); socket.close(); });
            socket.on("error", reject);
        });
        expect(message.type).toBe("error");
        expect(message.message).toContain("workspace changed");
    });

    it("closes and reopens the panel with a fresh shell", async () => {
        await ctx.page.locator("#panel-tab-terminal").hover();
        await ctx.page.getByRole("button", { name: "Close Terminal", exact: true }).click();
        await expect.poll(() => ctx.page.locator(".terminal-host").count()).toBe(0);
        await ctx.page.getByRole("button", { name: "Views", exact: true }).click();
        await ctx.page.getByRole("menuitemcheckbox", { name: "Terminal", exact: true }).click();
        await ctx.page.getByRole("textbox", { name: /^Workspace terminal/ }).waitFor();
        await command("printf '\\nREOPENED\\n'");
        await expect.poll(() => screen().textContent()).toContain("REOPENED");
    });
});
