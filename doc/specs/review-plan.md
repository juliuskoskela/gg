# Review: implementation plan

Review mode stays a draft until GG has a plugin system; it will be the first plugin built on it. This plan describes what goes into core, what goes into the review plugin, and the order to build them. It replaces the standalone comment model in [review-mode.md](../reviews/review-mode.md) with the annotation anchors and threads from [annotations.md](annotations.md), keeping the frozen-patch snapshot for export.

## Reference: Linear Diffs

Linear shipped in-app PR review in May 2026 ([blog](https://linear.app/now/code-review-should-be-fast), [docs](https://linear.app/docs/diffs)). Its principles are *fast, focused, in context*: a review queue sorted by what is closest to shipping, a diff that opens instantly, file categories from `.gitattributes`, implementation-only line counts, AI *Guided Reviews* that regroup a PR into chapters in reasoning order, inline threads synced to GitHub, a cloud coding agent that answers comments, and stacked PRs shown as an ordered set but reviewed one PR at a time.

Much of that works around git hosting: a PR is a flat diff of a branch, so the Guide reconstructs the order the work was reasoned through, and review progress is tied to line positions and commit SHAs that a force-push invalidates. jj does not have these limits. A stack of changes already is that order, change ids survive rewrites, and the evolution log records every version of a change. The plan builds on those.

## Principles

- **The stack is the guide.** Each change is one logical step with its own description. Reviewing a stack is walking it in the timeline. A change too large to review is split during review, not summarised around.
- **Progress survives rewrites, visibly.** Review state is keyed by change id and remembers the exact commit reviewed. After a rebase or an agent edit, GG shows what changed since then instead of resetting or silently carrying marks over.
- **Local first.** Everything works without a host or network. Host sync is a plugin, and never on the critical path of opening a diff.
- **One comment system.** Review threads are annotations. The plugin adds review structure (sessions, verdicts, snapshots), not a second store.

## Phase 1: core

These are useful without review mode and need no plugin system.

### File categories

Read review categories from `.gitattributes`, using the attribute names Linear introduced so a repository set up for one tool works in the other: `review-implementation`, `review-test`, `review-documentation`, `review-generated`, `review-agent-guidance`, `review-localization`, `review-assets`, plus GitHub's `linguist-generated` and `linguist-documentation`. `attr` or `attr=true` sets a category; `-attr` or `attr=false` unsets it. Unclassified files are implementation.

- Backend: evaluate attributes against the revision's tree (nested `.gitattributes` files apply to their directory), returned with each file in the revision's changes. Files read from the commit, not the working copy, so categories follow history.
- Changes view: a *Group by type* option in the file tree; categories show as a quiet label on the file row.
- Counts: the Changes header and timeline show implementation lines by default, with the full total on hover when they differ. Test and generated diffs stay visible when they are the only changes.

`.gitattributes` describes paths, not commits; nothing per-commit is stored there.

### Reviewed marks

Mark a file in a revision, or a whole change, as reviewed. Marks live in GG's data directory beside annotations (keyed by `.jj/repo/config-id`, append-only, one file per event) and record person, change id, the commit id reviewed and, for files, the path and a hash of that file's diff.

Each mark resolves to one of:

| State | Meaning |
| --- | --- |
| Reviewed | The change's current commit is the one reviewed, or the file's diff hash is unchanged after a rewrite (for example a rebase that didn't touch it). |
| Changed since review | The change was rewritten and this file's diff differs. |
| Gone | The change is abandoned or the file no longer changes. |

Shown as a check on file rows and a progress count on the change in the timeline and Changes header. Marks are per person; agents do not set them.

### Changed since review

For a change marked *Changed since review*, offer a diff between the reviewed version and the current one, taken from the evolution log. Rebases are factored out (compare each version against its own parents' tree, then diff those patches), so the reviewer sees what the author or agent changed, not what moved underneath. The evolution panel offers the same comparison between any two versions.

### Range review

With a range selected in the timeline, Changes shows the combined diff of the range, and each file and hunk links back to the change in the range that last touched it. Reviewed marks and notes made here attach to that change, not to the range. Scattered selections (Ctrl+click) open as a list of per-change diffs rather than a combined diff, since they have no single base.

## Phase 2: plugin host

The minimum the review plugin needs, designed around it as the first consumer:

- A manifest and enable switch (the candidate's bundled-extension shape, kept).
- Views and commands registered through the existing registries, menu sections in `ContextMenu`, and toolbar contributions through `ViewToolbar`.
- Read access to queries, the annotation API, reviewed marks and repository events; no direct mutations.
- Plugin-owned storage under the repository's data directory, namespaced by plugin id.
- Facts fed back to core (for example *merged upstream*) arrive as plugin events, never as writes into `.jj/`.

Arbitrary third-party code loading is out of scope until the bundled shape has proven itself.

## Phase 3: review plugin

Rebuild PR #14 on the host:

- **Session.** A review is a named set of changes (from a timeline selection) plus participants and a verdict per person: *approve*, *request changes*, *comment*. Membership is by change id; the frozen snapshot records the commits at capture time.
- **Threads are annotations.** Comments are annotations whose targets are the review's anchors, tagged with the review id. Line threads use the existing anchor states (current, rewritten with quote match, missing) and are never moved silently.
- **Walk the stack.** The review view lists member changes in stack order with description, progress and open threads; next/previous moves change by change, and the Changes view follows. A change can be split from here with `jj split` semantics; its reviewed marks and threads go to whichever half keeps the files.
- **Snapshot and exchange.** Keep `gg.review` export and import for offline handoff, now serialising annotations and marks. Readable when the commits are absent locally, as today.
- **Queue.** A *Reviews* view lists sessions waiting on you, sorted by closeness to done (open requests, unresolved threads, changed since review).

## Phase 4: agent loop

Annotations already reach agents through copy and `gg annotations`. Close the loop:

- *Send to agent* on a thread copies or pipes it with location and quoted code.
- `gg annotations reply --agent` records the agent and model; optional risk level, using the same fields as Linear's comment extension (`onBehalfOf`, `riskScore`) so they round-trip through hosts.
- When the agent edits the working copy, jj snapshots it, the timeline updates, and the reviewer sees *Changed since review* with only the agent's edits.
- Threads show *agent replied* and *change rewritten* as status, without notifications beyond the existing markers.

## Phase 5: host sync plugins

Separate plugins per host (GitHub first, tangled.org next), on top of the review plugin:

- Map a stack of changes to a stack of PRs, or a single PR, and its review requests into the queue.
- Sync threads both ways as annotations; read and write Linear's `<!-- linear:extension … -->` comments so agent metadata survives.
- Report verdicts and merge state back to GG as plugin facts.
- Fetching runs in the background; review never waits on the network.

## Later

- **AI guide for one large change.** Only where a single change is too big, generate an ordered walkthrough of its hunks, and offer to split along it.
- **Structural highlighting** of the part of a line that changed, if `@pierre/diffs` or a later renderer supports it.
- **Keyboard:** go to file, go to symbol, next/previous change and thread.

## Open questions

- Whether reviewed marks should be shareable (exported with notes), or stay personal until a review session includes them.
- Whether a split during review should carry marks automatically or ask.
- How plugin storage and annotation storage share one data directory without plugins depending on annotation internals.
