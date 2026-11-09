# Splitting a change during review

`Split change…` is a core revision command. A plugin can request the same core
flow through `navigation.split(id)`; it cannot choose files, bypass confirmation,
or invoke arbitrary repository mutations. The host checks plugin permission again
before the core dispatches the mutation.

The first version supports whole files. Select a nonempty proper subset, edit the
two titles, and confirm the result. Existing description bodies are preserved.
The source must be one current, mutable, conflict-free revision. The exact source
commit and repository operation are checked after snapshotting and before writing.
An intervening edit, operation, divergence, or immutable source rejects the split.

The mutation follows jj's selected-first split semantics in one transaction:

- The selected files retain the source change ID.
- A new child change holds the remaining files and the original complete tree.
- Descendants are rebased onto the child. Working copies on the source move to it.
- Bookmarks follow jj's normal rewrite behavior, including its legacy split setting.

## Ownership and recovery

An immutable receipt is saved beside local annotations before committing the
repository transaction. It records the original exact revision, both resulting
revisions, the previous operation, and each file's owner. Failure to save it aborts
the mutation. A failed repository transaction can leave an inactive receipt.

A receipt is active only when both resulting change IDs resolve unambiguously and
their current versions retain the recorded split versions in their evolution.
Undo deactivates it; redo reactivates it. Merely reusing a change ID does not prove
ownership. `query_split_receipts` returns active receipts for exact source members,
so a review session can recover after a crash between the split and its own save.
`query_split_receipt_states` also returns known inactive receipts. An empty result
means no local evidence, rather than an undo; imported session memberships must
remain unverified until their receipt is available.

Review events are replayed in time order with active receipts. The split distributes
whole-file marks while preserving their actual reviewed commit, timestamp, hash,
and reviewer. It clears whole-change approval. Later explicit review or unreview
actions apply only to their own resulting change. A moved file's original change
ID remains available for an ownership-proven, path-filtered comparison.

Receipts never rewrite annotation anchors or pretend that a new commit was reviewed.
Annotation projection must retain original provenance. Change-wide and ambiguous
partial-file anchors need an explicit unresolved state rather than a guessed owner.

## Annotation projection

File and line notes follow active receipts through the source's evolution history.
Their stored anchor remains unchanged. The returned target carries a separate
`relocation` with the current owner and traversed receipt IDs; the interface labels
it **Moved by split** and keeps the original revision in its provenance tooltip.
Timeline counts and file markers use that owner. Quote matching still uses the
original commit basis, so moving a note never implies its text was rechecked.

Repeated splits follow predecessor order, not receipt timestamps. Competing
receipts from the same source are ambiguous. Change-wide notes, files outside the
split patch, and conflicting histories stay at the original anchor with an explicit
reason. Unavailable history also retains the note and reports that ownership cannot
be established. Undo removes the computed relocation; redo restores it. Export
retains the original anchors and describes computed ownership separately.
