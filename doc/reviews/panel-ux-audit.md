# Workspace panel UX audit

2026-11-05. GG+ desktop and touch workspace pass. Applied the local Anthropic
frontend-design skill, retaining the established typography, palette and graph
semantics. The final file-tree position follows the user's correction: right.

## Changes and resolved findings

| Finding | Resolution |
| --- | --- |
| Pane controls moved or disappeared with the pane they controlled. | One persistent workspace header owns History on the left, then Revision and Files on the right. Recorded coordinates remain unchanged through all valid visibility combinations. |
| Duplicate file controls and separate compact arrangements made the interface jump. | One Files toggle, outside the panes. The current filename opens the same browser. Repository navigation expansion never switches its presentation. |
| File browsing began below the revision description. | Right-side tree spans the complete revision area: description title, metadata and diff. Phone overlay occupies that same area. |
| Hidden browsing discarded local context. | Tree stays mounted while hidden, preserving filter, folder expansion and scroll. Selected file, diff scroll and description drafts survive pane changes. |
| Closing both main panes would leave a dead end. | The sole visible main pane cannot be closed on desktop. Compact History and Revision controls select the visible view. |
| Narrow header actions competed with the revision title. | Shared revision actions move into overflow when space is limited. Phone revision actions remain available at the bottom. |
| Repository actions wrapped the 320px toolbar into another row. | Fetch, Push and Undo move into More at the narrowest width. Their menu labels remain visible, and running an action dismisses the menu. |
| A file control could appear usable without revision content. | Files is disabled while the revision is hidden, loading, unavailable or failed. Its position stays fixed. |
| A thin splitter was difficult to grab. | The visible hairline retains a wider pointer hit area, increased for coarse pointers. Keyboard resizing remains available. |
| Touch hunk actions measured only 33px high. | Hunk rows now have a 44px minimum on coarse pointers and narrow phones. |

## Method and evidence

Two independent lower-cost tester agents used Playwright against isolated copies
of `res/test-repo.zip`, with separate backend ports and Vite proxies serving the
current source. These are agent audits with touch emulation, not human usability
sessions or physical-device tests. Repository mutations stayed in those fixtures.
A separate read-only visual review used the real running repository at port 6973.

- [Desktop action log](../../.taste-skill/panel-pass/desktop-final/desktop-actions.log)
- [Desktop trace](../../.taste-skill/panel-pass/desktop-final/desktop.trace.zip)
- [Desktop tester findings](../../.taste-skill/panel-pass/desktop-final/findings.md)
- [Repository operation log](../../.taste-skill/panel-pass/desktop-final/mutation-actions.log)
- [Repository operation trace](../../.taste-skill/panel-pass/desktop-final/mutation.trace.zip)
- [Successful mutable-parent Squash trace](../../.taste-skill/panel-pass/desktop-final/mutable-squash.trace.zip)
- [Revision drop and Undo trace](../../.taste-skill/panel-pass/desktop-final/revision-drop.trace.zip)
- [Touch tester findings](../../.taste-skill/panel-pass/mobile-final/findings.md)
- [Touch viewport trace](../../.taste-skill/panel-pass/mobile-final/audit4/final-trace.zip)
- [Touch viewport recording](../../.taste-skill/panel-pass/mobile-final/audit4/final-video.webm)
- [Touch file selection and draft trace](../../.taste-skill/panel-pass/mobile-final/audit5/targeted-trace.zip)
- [Touch file selection and draft recording](../../.taste-skill/panel-pass/mobile-final/audit5/targeted-video.webm)
- [Corrected hunk touch target](../../.taste-skill/panel-pass/mobile-final/audit5/04-hunk-after-fix.png)
- [Real repository, dark](../../.taste-skill/panel-pass/root/final-desktop-dark.png)
- [Real repository, light](../../.taste-skill/panel-pass/root/final-desktop-light.png)
- [Real repository review trace](../../.taste-skill/panel-pass/root/final-review-trace.zip)
- [Nested folder continuity measurement](../../.taste-skill/panel-pass/root/folder-continuity.json)

Raw recordings are local, ignored artifacts under `.taste-skill/panel-pass/`.
This report and the panel specification are versioned. Script locator errors and
stale embedded-asset attempts are excluded from product findings. The first
baseline touch-size claim was made without coarse-pointer emulation; final touch
checks use `hasTouch: true` and supersede that measurement.

## Coverage and limits

The browser regression suite covers panel position and visibility, full-height
right-side file browsing, repository navigation continuity, description drafts,
file search and selection, split/unified diffs, wrapping, phone focus restoration,
keyboard and pointer graph resizing, empty revsets, error recovery, workspace
loading and repository mutations.

| Path | Recorded result |
| --- | --- |
| Desktop panels at 1440, 1024 and 834px | Fixed toggle coordinates; valid both-pane and single-pane states; narrow action overflow. |
| Full-height file tree | Rightmost 200px column; filter survives hide/show and repository navigation expansion. |
| Nested folder continuity | Live repository: collapsed folder remains collapsed and retains its original DOM node after Files hide/show. |
| Phone at 390px | Right overlay spans the revision workspace; autofocus, filter persistence, Escape, outside touch, selecting `d.txt` and focus restoration pass. |
| Phone at 320px | Single-row repository toolbar, labeled overflow actions and no document overflow. |
| Touch tablet at 834×1194 and 1194×834 | Full-height right-side files, History/Revision access and rotation pass. |
| Description editing | Desktop draft preservation/cancel, save/undo; touch draft cancellation without saving. |
| Revision operations | Description save, new child, bookmark, backout, checkout, restore, Duplicate, Abandon and Squash into a mutable parent pass with Undo on isolated fixtures. Immutable-destination Squash correctly shows validation. |
| Menus and direct manipulation | Revision/file/hunk menus and hunk disclosure open; drag hint appears and clears on canceled drag. A revision drop onto another mutable revision succeeds, then Undo restores the source. |
| Recovery | Empty revset, injected refresh error and recovery; no-workspace path validation and opening a fixture. |
| Visual states | Real repository reviewed at 1440px in light/dark; touch light/dark captures retained. |

The touch tester remeasured the corrected hunk: 44px content, 48px button at
390px with coarse pointers. No remaining panel layout defects reproduced in
the final independent audits. Native Tauri file pickers, external diff/merge
tools, real remote authentication/push and physical touch devices were not
exercised by these browser runs. File/hunk context-menu mutations were inspected
but not executed in the independent audits; the recorded drop used revisions.

## Validation

- `npm run build`: passes, including Svelte/TypeScript diagnostics with no errors
  or warnings. Vite retains the existing large lazy grammar-chunk warning.
- `npm run test`: all 49 tests in 15 files pass, using the installed Chrome
  through `GG_TEST_BROWSER` inside `nix develop`.
- `cargo fmt` and `cargo clippy`: pass inside `nix develop`.
- `git diff --check`: passes.

[Build log](../../.taste-skill/panel-pass/root/build.log),
[test log](../../.taste-skill/panel-pass/root/tests.log),
[Clippy log](../../.taste-skill/panel-pass/root/clippy.log).
