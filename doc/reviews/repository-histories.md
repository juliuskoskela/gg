# Evolution and repository history

GG+ exposes two jj histories alongside the existing revision graph:

- **Evolution** follows rewrites of the selected exact revision. Open it from the revision overview, Views, or Commands → Change evolution.
- **History** explores recorded repository operations. Open it from the clock in repository navigation, Views, or Commands → Repository history.

Both views use the existing dock. They can be stacked, separated, resized, and closed. On narrow panes the entry list sits above its details; larger panes show them side by side. Up/Down and Home/End move through entries with keyboard focus and selection together.

## Inspection semantics

Evolution uses jj-lib 0.46's `evolution::walk_predecessors`, the same primitive as `jj evolog`. It shows exact commit IDs, logical change IDs, author time, recording operation, and predecessor IDs. Squashed contributions can have other change IDs and are identified as contributed changes. The selected version's patch is against **its own parents**. This is not an interdiff or a diff against the current checkout.

History uses `op_walk::walk_ancestors`. Entries include snapshots and concurrent operation merges; predecessor navigation retains every parent rather than inventing a linear chain. Selecting an operation loads a separate read-only repository with `RepoLoader::load_at`. Its workspaces, local bookmark targets (including conflicted targets), heads, and revision ancestry come from that historical view. Selecting a graph revision or an available bookmark/working-copy target opens that exact version's patch.

Inspection does not check out a revision, restore an operation, or move a bookmark. The existing Undo and Redo actions remain in the repository toolbar. An arbitrary operation Restore/Revert workflow and patch interdiff are separate future features.

Lists page 40 records at a time. Operation pagination retains its original head even if other clients mutate the repository. Incoming status updates offer Refresh without discarding the historical selection. The snapshot graph shows the newest 60 visible revisions and explicitly labels truncation; bookmark and workspace assignments remain listed even when their targets fall outside that graph slice.

These histories are local and may be shortened by operation retention, abandonment, or garbage collection. They are not a durable shared review or evidence ledger. Missing objects and failed reads show retryable errors.

## Visual guidelines

The palette remains the shared neutral system: dark ground/surface `#1f1f1e`, raised `#252524`, rule `#2b2b2a`, text `#d4d4d0`, muted `#a6a6a0`. Light ground `#f5f5f3` and surface `#fafaf9` use the same semantic roles. There are no history-specific themes or component libraries.

IBM Plex Sans carries interface text; JetBrains Mono is limited to exact revision identifiers. Rows are compact, left aligned, and separated by space. Only pane boundaries and meaningful sections receive hairlines. Historical ancestry uses a 1px neutral ink tint at 16%, so nodes and descriptions retain priority. Selection and hover use the existing theme-relative ink overlays.

Long native operation descriptions abbreviate embedded hashes to eight characters for reading. Exact IDs remain in metadata and tooltips. Authored and recorded times are distinct because a rebase or describe can preserve the author timestamp.

Text fields use one neutral focus stroke, derived from 55% theme text over the surface, without a second accent outline. Forced-colors mode restores a system focus outline. The shared textarea's resize grip inherits the field surface instead of painting a white native corner. Close buttons sit one space after every view title, including plain single-view headers, and appear on hover or focus within the title; their reserved space prevents label movement, and touch layouts keep the close controls visible.

Single-view headers keep controls on their title row. Stacked views put controls beneath the tab strip. At very narrow widths, a single-view controls area scrolls horizontally rather than moving below the title or shrinking touch targets. Diff layout controls use icons with accessible names and tooltips. File counts live in the Files and Diff title components. Revision-wide addition/deletion totals use the shared DiffStat component on the trailing side of the Hunk actions row, including a static summary when no editable hunks are available.

## Verification

Real jj repository tests cover exact predecessor commits and old patches, historical workspace assignment, stable operation paging while operations arrive, invalid IDs, and end-of-history exhaustion. Browser checks exercise actual HTTP handlers, version patches, historical graphs, both themes at 320/390/768/1440px, keyboard selection, stale responses, retry, paging, and non-mutating inspection. Field styling and tab close visibility have browser checks as well.

Reference semantics: [jj evolog](https://www.jj-vcs.dev/latest/cli-reference/#jj-evolog), [operation history](https://github.com/jj-vcs/jj/blob/main/docs/operation-log.md). API behavior is pinned to the project's jj-lib 0.46 sources rather than the moving latest documentation.
