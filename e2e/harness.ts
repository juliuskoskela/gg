import { chromium, Browser, Page } from "@playwright/test";
import { spawn, ChildProcess, execSync } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

export const PROJECT_ROOT = join(fileURLToPath(import.meta.url), "../..");
export const TEST_REPO_ZIP = join(PROJECT_ROOT, "res", "test-repo.zip");

export interface TestContext {
    browser: Browser;
    page: Page;
    ggProcess: ChildProcess | null;
    tempDir: string;
    /** GG's data directory, outside the repository so notes never show up as files */
    dataDir: string;
}

export async function createContext(): Promise<TestContext> {
    let browser = await chromium.launch({ headless: true, executablePath: process.env.GG_TEST_BROWSER || undefined });
    let page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    let tempDir = await mkdtemp(join(tmpdir(), "gg-test-"));
    let dataDir = await mkdtemp(join(tmpdir(), "gg-data-"));
    return { browser, page, tempDir, dataDir, ggProcess: null };
}

export async function closeView(page: Page, name: string): Promise<void> {
    let close = page.getByRole("button", { name: `Close ${name}`, exact: true });
    // desktop close actions appear when the pointer enters the tab pill.
    await close.locator("..").hover();
    await close.click();
}

export async function destroyContext(ctx: TestContext): Promise<void> {
    await ctx.page?.close();
    await ctx.browser?.close();

    if (ctx.ggProcess) {
        ctx.ggProcess.kill();
        ctx.ggProcess = null;
    }

    try {
        await rm(ctx.tempDir, { recursive: true, force: true });
        await rm(ctx.dataDir, { recursive: true, force: true });
    } catch {
        // ignore cleanup errors
    }
}

export function startGG(ctx: TestContext): Promise<string> {
    let ggProcess = spawn("cargo", ["run", "--", "web", ctx.tempDir, "--no-launch", "--foreground"], {
        cwd: PROJECT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GG_DATA_DIR: ctx.dataDir },
    });

    ctx.ggProcess = ggProcess;

    let serverUrl = new Promise<string>((resolve, reject) => {
        let stderrOutput = "";
        let stdoutOutput = "";

        ggProcess.stderr?.on("data", (data) => {
            stderrOutput += data.toString();
            let match = stderrOutput.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) {
                resolve(match[0]);
            }
        });

        ggProcess.stdout?.on("data", (data) => {
            stdoutOutput += data.toString();
            let match = stdoutOutput.match(/http:\/\/127\.0\.0\.1:\d+/);
            if (match) {
                resolve(match[0]);
            }
        });

        ggProcess.on("error", (err) => {
            reject(new Error(`Failed to start gg: ${err.message}`));
        });

        ggProcess.on("exit", (code) => {
            if (code !== null && code !== 0) {
                reject(new Error(`cargo run exited with code ${code}\nstderr: ${stderrOutput}\nstdout: ${stdoutOutput}`));
            }
        });

        // timeout after 120 seconds to allow for compilation
        setTimeout(
            () => reject(new Error(`cargo run timed out\nstderr: ${stderrOutput}\nstdout: ${stdoutOutput}`)),
            120000,
        );
    });

    return serverUrl;
}

export function extractTestRepo(destDir: string): void {
    if (process.platform === "win32") {
        // Windows: use tar (available since Windows 10 1803) or PowerShell fallback
        execSync(
            `powershell -Command "Expand-Archive -Path '${TEST_REPO_ZIP}' -DestinationPath '${destDir}'"`,
            { stdio: "pipe" },
        );
    } else {
        // macOS/Linux: use unzip
        execSync(`unzip -q "${TEST_REPO_ZIP}" -d "${destDir}"`, { stdio: "pipe" });
    }
}

/** the changed-files drawer at the bottom of the Diff view */
export function changedFilesDrawer(page: Page) {
    return page.locator("#changed-files-drawer");
}

/** opens the drawer from its toggle (switching to the Diff tab first if the dock is tabbed) and returns it */
export async function openChangedFiles(page: Page) {
    let drawer = changedFilesDrawer(page);
    let tab = page.getByRole("tab", { name: "Diff", exact: true });
    // in a single-group dock the Diff tab may be unselected; split layouts show it already
    if (await tab.count() && (await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    let toggle = page.getByRole("button", { name: "Show changed files", exact: true });
    await toggle.or(page.getByRole("button", { name: "Hide changed files", exact: true })).first().waitFor();
    if (await toggle.count()) await toggle.click();
    await drawer.locator("aside").waitFor();
    return drawer;
}

/** starts every page of the context with the drawer open, for tests about something else */
export async function seedChangedFilesOpen(page: Page, height = 240, side = "bottom") {
    await page.addInitScript(({ height, side }) => localStorage.setItem("gg.diff.files", JSON.stringify({ open: true, side, width: 280, height })), { height, side });
}
