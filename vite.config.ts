import { neovimDemo } from "./demo/neovim/plugin";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // editing this repository can replace components and their imports together.
  // reload the component tree instead of retaining incompatible HMR instances.
  plugins: [neovimDemo(), svelte({ compilerOptions: { hmr: false } })],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  optimizeDeps: { include: ["@tauri-apps/api/webview"] },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 6973,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:6974",
        changeOrigin: true,
      },
    },
    watch: {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 25 },
      // 3. tell vite to ignore watching rust directories
      ignored: ["**/src/**", "**/target/**", "**/.jj/**", "**/.direnv/**"],
    },
  },

  build: {
    target: ["es2022", "chrome97", "edge97", "safari15"]
  },

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          include: ["app/**/*.test.ts"],
          browser: {
            provider: playwright({
              launchOptions: { executablePath: process.env.GG_TEST_BROWSER || undefined },
            }),
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        test: {
          name: "e2e",
          include: ["e2e/**/*.test.ts"],
          testTimeout: 120000,
          hookTimeout: 120000,
          fileParallelism: false,
        },
      },
    ],
  },
}));
