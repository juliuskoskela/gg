# Personal review progress

Implements [issue #12](https://git.digimuoto.com/juliuskoskela/gg/issues/12) in core. Review sessions, verdicts and host synchronization remain in the future review plugin. Showing a comparison against the reviewed version belongs to #13.

## Interaction

Select one revision. The Changes header offers **Change reviewed** and the current file's footer offers **File reviewed**. These explicit actions are toggles; viewing or scrolling through a diff never marks it. File rows show a check when reviewed and a rewrite icon when their reviewed patch changed. The timeline and Changes header show the current person's reviewed-file count.

Marks belong to the configured jj user (email, falling back to name when no email is configured). The app supplies that identity; requests cannot submit another person or an agent identity. Agent replies and repository mutations never create review marks. These are personal progress indicators, not approvals or security assertions.

A range or scattered selection does not have one change identity, so it has no review toggle. Future range-review support will attribute each mark to its owning change. Earlier recorded versions can still show their exact reviewed status when opened; a mark on one version does not imply that an unrelated version was reviewed.

## Storage

Events live in `<GG data>/repos/<config-id>/reviews/<event-id>.json`, beside annotations. `GG_DATA_DIR` overrides the application data root. The repository key is the same `.jj/repo/config-id` used by annotations, so jj workspaces share marks and moving a repository preserves them. No review data is written to the working copy or `.jj/`.

Each versioned event records a unique id, timestamp, person, stable change id, exact reviewed commit id, optional file path, explicit reviewed/unreviewed action and file fingerprints. A whole-change event captures every changed file; a file event changes only that file. Clearing a whole change clears that person's file marks. Each append is an fsynced temporary file published without overwriting an existing event. Events are replayed by timestamp/id; malformed or unsupported events report an error rather than silently losing progress.

The exact reviewed commit is retained for the future comparison feature. The current state is derived against visible commits, never written back over the original record.

## File identity across rewrites

Text fingerprints are BLAKE2b hashes of path, before/after file type and executable mode, and the ordered unified patch including three lines of context. Hunk positions are omitted only when the old and new context fragments occur uniquely. Repeated or ambiguous context retains positions, so moving an identical edit to another occurrence does not inherit a check.

An unrelated upstream insertion outside the hunk context may shift line numbers without losing the mark. Editing the patch or its nearby context invalidates it. Ambiguous contexts are deliberately conservative: even an innocuous shift may require reviewing again. Binary files, invalid UTF-8, symlinks, submodules and conflicts use complete before/after tree-value fingerprints, including modes and conflict terms. Their marks survive only when those values stay identical. This is a content check, not a claim that the surrounding program's behavior is unchanged.

- **Reviewed:** the captured file fingerprint still matches (including after metadata rewrites/rebases).
- **Changed since review:** the path still changes but its fingerprint differs; divergent visible successors remain uncertain and are not claimed as reviewed.
- **Gone:** the change is no longer visible, or the path no longer changes. Its original record remains available.

An explicit whole-change review also covers its description. A description rewrite invalidates that whole-change mark while leaving unchanged file marks intact. A pure rebase with unchanged description and file patches preserves both. If the recorded description can no longer be read, the whole-change state is conservative.

New files start unreviewed. Removed reviewed files do not count toward progress and prevent the whole change from appearing wholly reviewed until it is explicitly reviewed again.

## Boundaries and validation

`src/review.rs` owns append-only storage, `src/worker/review.rs` resolves fingerprints and visible versions, and `src/messages/review.rs` defines the protocol. GUI and web handlers route the same `review_progress` command through the worker; frontend requests use the local-data `annotate()` transport rather than repository mutations.

`app/review/` owns state, presentation and explicit review actions. Repository-scope epochs clear state on a workspace switch and discard late responses. Background refreshes do not supersede an explicit mark in flight. Errors are surfaced beside the controls.

Tests cover per-person isolation, append preservation, clear actions, metadata rewrites, edited/removed files, canonical patch rebases, changed/repeated context, binary fallback, explicit UI payloads, historical versions and late responses across repositories.
