# Edit → Undo development reload regression

2026-11-05. Reproduced in an isolated clone of GG, with Vite serving that clone's
frontend and GG inspecting the same clone. The real workspace was not checked
out or undone during the reproduction.

## Cause

Edit checks out the selected revision. When that repository is GG's own running
source, the operation replaces frontend components, styles and shared exports.
Svelte hot replacement tries to retain existing component instances while those
files change. After Undo, the browser can retain older instances/imports and
combine them with restored styles and components.

The historical replay checked out `3fb4f67` from `3498035`, then undid it. The
original configuration produced missing `mobileFilesVisible` export errors and
`Cannot read properties of undefined (reading 'default')`. The shared workspace
header remained absent after Undo. A manual page reload restored it, confirming
that the stale browser module/component state caused the persistent corruption.

## Fix

Disable Svelte component HMR in the development configuration. Component changes
now reload the full page. The watcher also waits 200ms for writes to settle,
with 25ms polling, before delivering changes. Standalone CSS files still update live;
operations that do not rewrite frontend files do not cause a source reload.
The embedded production frontend is unaffected by this configuration change.

The running Vite server restarted with the corrected configuration. Its served
`App.svelte` has the shared header and no Svelte HMR wrapper/accept handler.

## Regression coverage

`e2e/dev-checkout.test.ts` copies the actual frontend into a disposable repository.
It creates an earlier layout with a different shared export and an absent Files
component, then records the current layout. Both snapshots are created through
GG's backend; no installed `jj` CLI or project Git history is required.

The browser performs Edit → Undo twice against a Vite server using the real
project configuration. Each cycle verifies that the correct source generation
renders, the shared header is 40px high, the panes start immediately below it,
only one Files toggle exists and no JavaScript runtime errors occur. The test
failed with the original HMR configuration and passes with the fix.
It also verifies that a normal `global.css` edit updates the styles without
reloading the page.

Validation: frontend build and Svelte checks, all 50 tests, E2E TypeScript check,
Rust formatting and Clippy. E2E TypeScript now targets ES2022, matching the modern
Node runtime and allowing iterator use in the existing browser tests.

## Local evidence

- [Historical reproduction trace](../../.taste-skill/edit-undo/baseline.trace.zip)
- [Original corrupted layout](../../.taste-skill/edit-undo/baseline-undone.png)
- [Original runtime errors](../../.taste-skill/edit-undo/baseline.log)
- [Fixed historical replay trace](../../.taste-skill/edit-undo/fixed.trace.zip)
- [Fixed replay log](../../.taste-skill/edit-undo/fixed.log)
- [Regression before the fix](../../.taste-skill/edit-undo/regression-before.log)
- [Regression after the fix](../../.taste-skill/edit-undo/regression-after.log)

The source tree really changes during this development-only workflow, so an older
revision can show its older UI until Undo restores the current source. Full page
reloads ensure that the UI represents one coherent source version.
