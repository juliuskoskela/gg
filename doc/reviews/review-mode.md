# Review mode candidate

An optional, local GG+ extension. Open **Views → Review** (also available in Commands), or open `/?panel=review` directly. Start from a selected revision or range. Review mode freezes the diff before discussion begins. It never edits repository history.

## Design direction

The review is a working document: files and diff on the left, an aligned conversation on the right. A small progress rail and seen marks provide orientation; comments use whitespace rather than nested cards. At narrow widths, Diff and Discussion switch within the same surface. Left alignment, existing control geometry, and a single neutral focus stroke keep it consistent with GG+.

Palette references: ground/surface #1f1f1e, raised #252524, rule #2b2b2a, text #d4d4d0, muted #a6a6a0. These are references only: implementation uses semantic theme tokens and relative interaction overlays. Light mode inherits the existing palette. IBM Plex Sans carries discussion; JetBrains Mono carries paths, IDs and code. Status uses words and icons, never color alone.

The distinctive interaction is a conversation attached to a frozen patch. Avoid extra permanent navigation, bright active outlines, nested bordered cards, avatars without useful identity, and badges for every datum. Shared controls, diff renderer and theme remain authoritative.

## Contract

`gg.review`, version 1, is a portable JSON document. It contains review identity, repository label (no local absolute paths), reviewer identity, frozen revision members and before/after endpoints, complete captured patch hunks, threads, append-only discussion/status events, and per-person file-seen events. Revsets store the union expression of the selected exact commits and frozen membership. Choose the selection in the graph; this candidate does not evaluate a separate free-form revset inside the review panel. Change comments identify a logical change ID; revision and line comments pin exact commit IDs. Line anchors additionally retain side, range and quoted source. They never silently migrate after rewrites.

Export marks a review complete, without closing discussion or requiring all threads to be resolved. Import is explicit and performs no repository commands. Recipients can read snapshots even if commits were rewritten or are absent locally. Reimport of the same review merges append-only events; conflicting IDs or different snapshots fail visibly. Imported text is rendered as text. Review identities are self-declared, not authenticated signatures.

Seen means this person inspected this captured file version. It does not carry to a newly captured patch. Export includes all captured patches (which may contain sensitive code), discussed explicitly next to the export action. Binary files retain metadata only. Snapshot context includes the patch's surrounding lines; uncaptured context cannot be unfolded offline.

Persistence uses this app origin's local storage. A storage failure remains visible; JSON export is the durable backup and transport. No network service, review server, email, or automatic publishing is involved. The candidate has a manifest and enable switch, with all review logic under `app/plugins/review`; the host only registers its view. It is a bundled extension, not an arbitrary-code plugin loader.


## Candidate boundaries

Reviews are immutable snapshots with continuing discussion. They do not automatically re-anchor lines or mark threads obsolete after a rewrite; these decisions remain explicit. A new review of a rewritten patch gets fresh file progress. This version supports at most 500 files/revisions and a 10 MB document. Conflict marker files can be discussed at revision/change level; line anchoring is available for ordinary text patches. There is no identity verification, hosted review service or third-party plugin loader.

## Validation

The candidate is covered by model validation/merge tests, a browser exchange between isolated author and recipient sessions with the source revisions unavailable to the recipient, eight theme/width combinations, plugin enable/disable persistence, and existing diff-folding/settings regressions. A production build was also exercised against the real jj backend to capture a review, add a comment, mark a file seen and download its JSON. Native saving uses a user-selected file dialog; the dialog itself needs manual desktop verification.

The candidate is based on the shared toolbar PR #16, stacked above `gg-plus`; Review remains unmerged in PR #14. It inherits all nine appearances, the shared workspace blue, active single-view pills and pointer/keyboard focus behavior. Global review actions use `ViewToolbar` below the title: library, New, Import, Finish & export, and Expand. File-specific diff controls and discussion actions stay with their content. Expansion requests a local toolbar from the same component, withdraws its dock contribution, and restores focus on entry and return.

Toolbar integration verification covers 215 component tests and 14 review browser checks, including import through the actual browser file chooser, retained toolbar state, responsive layouts, keyboard focus during expansion, and the complete offline export/import/reply workflow. Native OS save-dialog interaction still needs manual desktop verification.
