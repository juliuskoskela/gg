import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    testMatch: "*.spec.ts",
    fullyParallel: false,
    workers: 1,
    timeout: 120_000,
    reporter: "list",
    outputDir: "../results/visual",
    snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
    expect: {
        timeout: 10_000,
        toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 0 },
    },
});
