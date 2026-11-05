# Full-scope implementation validation

2026-11-05. This supersedes the initial [72-test foundation report](validation-foundation.md). It records automated browser observations, isolated backend operations and simulated agent evaluation; no human participant study or WCAG certification is claimed.

## Current checks

| Check | Result |
| --- | --- |
| Full browser/component suite | 144 tests across 33 files passed on the final integrated source, including fonts, readability and virtual-file sizing; no unhandled errors. |
| Final frontend build and graph checks | Passed `npm run build` after the final readability fixes; Svelte check is included. Vite retains its existing large-chunk advisory. |
| Svelte | 0 errors, 0 warnings on final integrated source. |
| E2E TypeScript | Passed, `npx tsc --noEmit --incremental false --composite false -p e2e/tsconfig.json`. |
| Rust | `cargo fmt --check` and `cargo clippy` passed. `cargo test`: 209 library + 4 binary tests passed. `cargo gen`: 71 type exports passed; its test-only build reports two unused query-helper warnings. |
| Independent browser review | Three structural concepts evaluated; integrated paths and corrections retested. [Report](full-evaluation.md). |
| Typography/accessibility | [Independent audit](accessibility-typography-audit.md): local fonts, sampled rendered contrast, actual Chrome 200%/400% zoom, 32px default-font resizing and keyboard checks. Enlarged controls and file rows were fixed and retested. |
| Native Linux | Embedded frontend, native menu and command search rendered under X11. [Native evidence and Wayland limitation](native-validation.md). |

Reproduce browser checks with `nix develop -c sh -c 'npm run build && GG_TEST_BROWSER=/path/to/chrome npm run test'`. The divergence acceptance fixture uses the `jj` executable to create concurrent operation branches; application users still do not need an installed CLI. Mutation fixtures are temporary copies of `res/test-repo.zip`, local bare remotes, or generated repositories. No test pushes to an authenticated remote or edits the user's repository history.

## Acceptance evidence

| Original scenario | Current evidence and boundaries |
| --- | --- |
| Mobile browsing | 105 added revisions; rapid delayed selection, 72px collapse/reopen, handle-only drag/cancel and graph scroll restoration. Latest summary/diff wins. Separate graph and preview wheel scrolling observed in landscape. |
| Deep inspection | 30-file fixture, file 20 search, exact Full/file URL, Back/Forward, vertical and horizontal reading restoration. 270-file navigator mounts 23 rows in measured viewport. |
| Description editing | Save/Undo and cancellation; draft survives resize, pane remount and externally rewritten exact commit after explicit Refresh. Unverified/divergent commit changes do not inherit another commit's draft. |
| Graph manipulation | Actual revision move, file move/restore, hunk move/restore, bookmark movement/create, cancellation and Undo verified by repository state. Registry covers insertion/merge-parent commands; broad backend regression tests remain the authority for graph semantics. Every operation/topology was not independently replayed on every input platform. |
| Undo/recovery | Undo/Redo backend state assertions; authoritative pre-snapshot eligibility; exact selected revision/file restored after Undo. Local bare-remote scope, workspace restrictions and external diff invocation tested. Working-copy snapshot may affect the eventual Undo target and UI explicitly says so. |
| Future view | Real Current operation view and registered test view: bounded desktop tabs, compact destination, validated state, close/restore, sibling replacement, rotation and Back. No feature-specific shell branch required. |
| Desktop power use | Keyboard graph navigation, command palette, context-menu arrows/Home/End/Escape, graph and Files splitters, toolbar commands, tool/reader split and selection continuity. |
| Complex states | Real divergent incarnations, exact ranges, immutable/conflict fixtures, binary/deleted paths, empty/loading/errors and explicit missing-file recovery. Complete arbitrary multi-selection is not claimed; existing selection is a contiguous graph range. |
| Mobile edges | 320/360/390/430/768/1024/1440/1920 widths plus 844×390 landscape; light and actual dark themes, reduced motion, interrupted gestures, keyboard focus and long labels. Actual Chrome page zoom at 200%/400% and browser default-font enlargement were inspected separately in the typography audit. Physical OS keyboard and screen-reader speech remain unverified. |

Detailed traces and measured geometry are in `.taste-skill/studio/full-pass/evaluator/`; the report distinguishes initial mislabeled dark-media captures from corrected actual-dark captures. The director inspected representative final phone, desktop and native screenshots. Source-checkout Edit/Undo remains covered by `e2e/dev-checkout.test.ts`.

## Significant defects found and corrected

- Stale active-file response and missing-path fallback: staged query generations and explicit recovery.
- Undo jumping to the working copy or losing the prior file: repository-wide identity resolution and exact-selection file memory.
- External-client updates invisible even after Refresh: current-status query following an unchanged snapshot.
- Underlying tool controls exposed to role locators: matching inert and aria-hidden; actual browser accessibility tree/focus checked.
- Mobile completion feedback blocking Commands: a reserved status area during Full/tool feedback.
- File/hunk review omitting source, wrong Action accessible name and mismatched Restore wording: corrected and independently retested.
- 320px diff-options popup clipped offscreen: viewport-clamped placement with actual selection/wrapping interaction.
- Tool lost on rotation or overlaying Full controls: adaptive host state and reserved reader space.
- Typography and text enlargement: corrected mobile input specificity, enlarged phone reading text, scalable ID columns and bookmark chips, flexible headings, contained Full actions and scalable virtual file rows.
- WebKit graph bookmarks painted on wrong rows: remove the scrolling layer inside SVG foreignObject; `overflow-x:clip` verified in the native renderer. Complete refs remain in Details.

## Copilot review corrections

The reviewed stack now includes regressions for binary changes producing no editable diagnostic hunks, missing exact commits, divergent change-only recovery, stale contextual operands, and protection changes during pending confirmations. Arbitrary hunk restore is explicitly unavailable until forward-copy semantics are supported; whole-file restore and parent hunk restore remain available.

Fresh setup now builds the initial native assets and supplies `unzip` and the end-to-end browser override. Zero-field acknowledgements, standalone narrow revision actions, keyboard hunk selection and nested file-list semantics were checked. The versioned comparison has 11 assertion-based browser checks, including pinned task/draft identity and desktop Full → Commands → Move. One parallel Rust run hit the existing configuration-test interference; that test passed alone and all 213 Rust tests passed on the full rerun.

## Measured performance

The reproducible 270-file contract comparison is in [loading-performance.md](loading-performance.md). Summary 34KB plus active diff 410KB replaces fetching 4.9MB of all-file diff data for initial inspection. These are loopback measurements in this Linux environment, not generalized speed or frame-rate claims. Large individual files still render complete diff content to preserve selection/find semantics; measured long tasks are reported rather than hidden.

## Remaining release gates

Default Wayland in this environment reports negative WebKit viewport dimensions and DPR. The same executable and fixture render correctly with process-only `GDK_BACKEND=x11`; no global user setting was changed. This is an unresolved native platform release gate, not a passing Wayland test. macOS/Windows native interaction, physical iOS/Android touch/keyboard/safe areas and screen-reader speech remain unverified. Actual Chrome page zoom was subsequently tested; this does not establish equivalent native/OS text scaling. Stock Firefox launches but Playwright interaction support was unavailable in the installed binary; no alternate-engine interaction claim is made.

A full operation-history browser, evolution view, arbitrary docking, continuous all-files mode and embedded conflict resolver are deliberate future features, not missing implementations of the central inspector contract. External merge-tool execution and every remote/topology combination were not exhaustively exercised. Production/device acceptance therefore remains narrower than the implemented and automated-web scope.

## Reproducible final records

Accepted-checkpoint logs remain in `.taste-skill/studio/final-checks/`. Current review verification is preserved in `.taste-skill/studio/copilot-review/`: the 144-test browser run, frontend build, E2E TypeScript, formatting/Clippy and 213 Rust tests. The prior 71 generated type exports are unchanged by these review fixes. The readability audit also includes an independent 240-file component test. The remote/workspace fixture now runs its server in the foreground so teardown terminates it; orphan servers from earlier runs were stopped after confirming their temporary repositories had already been removed.
