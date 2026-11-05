# Workspace validation

## Executed checks

The final frontend build runs `npm run check` first: Svelte reports **0 errors and 0 warnings**. The production build succeeds; Vite still reports large chunks in the existing syntax-highlighting bundles and main bundle. No bundle-size or hardware-performance improvement is claimed.

| Check | Invocation | Result |
| --- | --- | --- |
| Build and Svelte checks | `nix develop -c npm run build` | Passed |
| E2E TypeScript | `npx tsc --noEmit --incremental false --composite false -p e2e/tsconfig.json` | Passed |
| Rust formatting | `nix develop -c cargo fmt --check` | Passed |
| Rust lint | `nix develop -c cargo clippy` | Passed |
| Full browser/component suite | `nix develop -c sh -c 'GG_TEST_BROWSER=/etc/profiles/per-user/juliuskoskela/bin/google-chrome npm run test'` | 72 tests passed across 19 files |
| Diff hygiene | `git diff --check` | Passed |

The 72-test full suite was rerun after the immediate selection-loading fix and passed on the final source.

Logs are preserved locally under `.taste-skill/studio/quality/`. Native Rust mutation code and dependencies were not changed.

## Observed browser behavior

Playwright/Chrome ran against temporary repositories through the actual GG web transport. The generated fixture creates 105 additional revisions and 30 files under a deep path, including a 500-line diff. A separate case adds 240 files for a 270-file navigator. No mutation test targets the developer's repository.

- Graph taps open Half without adding history. Full creates a precise commit/range/file URL. Refresh, Back and Forward resolve that selection. Shift-select followed immediately by Full retains both endpoints.
- Collapsed is a summary-only 72px strip; hidden expanded controls are inert. Handle cancellation is harmless. Content scrolling does not invoke the handle gesture.
- Graph keyboard focus and scroll survive Full/Back. The last graph revision can be scrolled above the Half sheet. Rapid selection with a delayed older query keeps the latest revision; changing selection clears the old preview immediately.
- File-20 search, focused diff reading, previous/next and per-file scroll restoration work. The 270-file navigator mounts fewer than 40 rows in the tested viewport and supports scroll/keyboard End to its last row, search and selection.
- Compact graph rows measure 44px; node, ID and description centers are within 2px. Author text is absent from graph rows and remains in the preview/details. Multi-bookmark rows retain description space.
- Desktop Files resizing works through mouse drag, arrows, Home/End, RTL direction, invalid-preference clamping, hide/show and reload. A separate director check measured 200 → 382px and restored 382px after reload. Phone file browsing has no resize divider.
- Description editing survives a desktop-to-compact resize. Standalone narrow revision windows retain actions. Repeated source-checkout Edit → Undo remains coherent; CSS-only edits retain the document.
- Independent evaluator observations include actual description Save → Undo, touch-command Move → Undo and desktop drag → Undo. The fixture's original graph/description were restored. Commands, disabled reasons, editor focus and the Current operation extension were inspected separately.

Screenshots cover 360, 390, 430, 768, 1024, 1440 and 1920 CSS-pixel widths in light and dark themes, plus landscape and Full. Each matrix case checks document horizontal overflow. Root inspected representative phone, full-revision and desktop captures, including the expanded Files panel. Evidence: [local review gallery](../../../.taste-skill/studio/review.html), [independent evaluation](evaluation.md), and `.taste-skill/studio/quality/`.

## Limits and remaining release work

These are automated browser observations and simulated agent evaluations, not human participant research. Actual screen-reader speech, physical touch feel, device safe-area behavior, OS keyboard occlusion, native Tauri interaction and hardware performance were not verified. The root-font 200% screenshot is a probe, not true browser zoom or a completed text-resize audit. This report does not assert WCAG conformance.

The backend still returns complete revision diff data; focused rendering and file-list virtualization do not provide incremental network loading. Arbitrary docking/tabs, continuous all-files mode, a full operation-history browser and a visual rebase destination picker remain future work. External diff/merge tools, authenticated remote operations, every file/hunk mutation and every divergent/conflict topology are not exhaustively covered by this browser audit.

Browser artifacts, prototype sources and traces are ignored local evidence under `.taste-skill/studio/`. Production implementation, tests and these decisions are versioned.
