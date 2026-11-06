# Diff context folding

A fold is the unchanged block before, between, or after the patch's hunks. One native button opens the whole block; the same control remains above the opened lines to collapse it. Both states use `createDiffFoldRow`, including the accessible action name, expanded state, contained chevron, hover surface, and keyboard activation. Narrow and touch layouts use 44px targets.

`DiffViewer` hydrates the patch before installing expanded controls, so annotations refer to complete file line numbers. Middle and trailing controls are line annotations; leading controls live above the renderer because Pierre annotations follow a line. Only display state changes. The original `RevChange.hunks` and mutation boundaries are preserved.

The clicked row keeps its vertical viewport position and keyboard focus while the renderer and its size manager update. Each unchanged block has independent state. Full-context mode shows all lines without local fold controls. Unavailable context is disabled; a failed file load leaves the control available to retry.

Pierre currently exposes expansion but no public collapse operation. `FoldingFileDiff` isolates access to its protected renderer and invalidates its render cache on collapse. Custom separator callbacks are deprecated in Pierre 1.6; when updating the dependency, verify its separator and annotation slot contracts with these interaction tests.

Verification:

```sh
GG_TEST_BROWSER=/path/to/chrome npx vitest run --project e2e e2e/diff-folding.test.ts
```

This Playwright suite serves an in-memory fixture through Vite, opens no repository or backend, and covers repeated pointer/keyboard activation, leading/middle/trailing blocks, viewport stability, independent folds, unchanged hunk boundaries, and full-context mode in light/dark themes at 1440px and 390px. It writes screenshots to `e2e/results/diff-folding/`.

`app/DiffViewer.test.ts` also checks unavailable context, failed-load retry, empty-side hunks, full context, and the existing syntax/scrolling behavior.
