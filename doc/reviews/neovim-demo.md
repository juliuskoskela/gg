# Embedded Neovim demo

This change is based on `gg-plus`. It demonstrates Neovim as the engine inside the existing revision reader; the graph, description, selected path, diff renderer, and file navigator keep their existing ownership.

## Try it

Requires Node, `nvim` (tested with 0.12.6), and `jj` on PATH. Unlike GG's normal operation, the experimental bridge uses the external jj CLI to read historical files.

Run the normal GG web backend on port 6974 for this repository, then:

```sh
GG_NEOVIM_DEMO=1 npm run dev:frontend -- --host 127.0.0.1 --port 7461
```

Open `http://127.0.0.1:7461/?inspect=gg-plus&file=app/global.css`, then choose **File** beside **Diff**. Select another file using the same existing file tree. Press `i` to insert, Escape for normal mode, `/` to search, and `u` to undo. Mouse positioning, visual selection, wheel scrolling, paste, and viewport resizing are forwarded to Neovim. Standard Neovim commands remain available through `:`.

If the backend inspects another repository, set `GG_NEOVIM_REPOSITORY=/absolute/path` when starting Vite. The bridge refuses a frontend repository that differs from that configured path. The provided navigator continues to show changed files; an All-files source is deliberately not implemented yet.

## Boundary and rendering

A dev-only Vite plugin launches a plugin-free `nvim --embed` per reader session. The official Node client handles MessagePack-RPC. A same-origin, random-token WebSocket forwards a bounded set of input and UI operations. Production builds disable the entry point and include no Node process bridge. Normal Vite runs do not start Neovim.

The frontend consumes `ext_linegrid`, applies updates in order, and draws on `flush`. A custom WebGL 2 renderer uploads glyphs to an atlas and draws background and glyph batches. It uses GG+'s JetBrains Mono, code size, line height and pixel ratio. Theme highlights are derived from the same semantic/syntax tokens used by the existing diff renderer. Different syntax engines can still classify tokens differently.

Each exact commit/path gets a scratch buffer. File switching and Diff/File switching preserve that buffer and its Neovim cursor/scroll. The data comes from `jj file show` at the precise selected commit, with literal path arguments, rather than reading current disk content for a historical revision. The initial syntax engine is Neovim's bundled syntax highlighting, not a claim of a configured Tree-sitter/LSP distribution.

## Limits before production

- **Scratch only:** edits are not saved to the repository and buffers disappear when the reader/session is destroyed or the page reloads. `nofile` prevents ordinary `:write`; this is not a security sandbox. Deliberate Neovim shell/file commands retain the power of the local user.
- **Development transport:** move lifecycle and repository policy to Rust before shipping. No remote/untrusted hosting; the development server should bind loopback only.
- **Accessibility/input:** a keyboard input textarea and readable visible-text mirror exist, but screen-reader editing, caret announcements, IME candidate positioning, OS clipboard integration, and mobile virtual keyboards need dedicated work. No accessibility-compliance claim.
- **Renderer:** WebGL 2 is required, with an explicit failure surface and Diff fallback. No native hardware-performance claim, smooth pixel-scroll animation, font ligature shaping, or complete multigrid support. Glyph atlas is capped at 2048 distinct styled glyphs; complex scripts need a production text renderer. Cursor is a simple block.
- **Integration:** no LSP, parser distribution, all-files tree, write conflict handling, external-change reconciliation, terminal, or unsaved-buffer recovery yet. Repository writes need working-copy validation and coordination with jj operations.

The point of the demo is to decide whether the embedded editing surface feels right before choosing a production renderer or expanding editing privileges.

## Validation recorded for this iteration

- `npm run build`: passed, Svelte check reported 0 errors and 0 warnings.
- `npx tsc --noEmit --incremental false --composite false -p tsconfig.node.json` and the equivalent E2E project check: passed.
- `nix develop -c sh -c 'cargo fmt --check && cargo clippy'`: passed.
- `GG_TEST_BROWSER=/etc/profiles/per-user/juliuskoskela/bin/google-chrome npm run test` inside the development shell: **186 tests passed across 40 files**.
- Real-Neovim regression: insertion, undo, retained scratch buffer across Diff/File, unchanged historical content and unchanged disk file. Grid tests cover highlight inheritance, repeated cells, flush and bounded scrolling.
- Playwright visual pass: 1440×960 at DPR 2, dark and light themes, file switching, then 390×844. No observed page errors or root overflow. Evidence is kept locally in `.taste-skill/neovim-demo/`.
- The visual run uses Chromium software WebGL (SwiftShader). This verifies the rendering path, not hardware acceleration or smoothness on the native Tauri webview. Native hardware profiling and device input testing remain open.
