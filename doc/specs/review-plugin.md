# Review as a bundled plugin

Issue: https://git.digimuoto.com/juliuskoskela/gg/issues/16

The optional Review plugin is the first consumer of the bundled plugin host.
Configure `user.name` and `user.email` in jj for the repository, enable the plugin
in Settings, then open Reviews from Views. The plugin refuses to invent a review
identity when those settings are absent. Participants and verdicts are local records,
not authenticated identities or server consensus. Sharing happens through explicit
snapshots; no background collaboration service is provided. It stores sessions in
GG's repository data directory through its own host namespace. Nothing is
written into `.jj/`, the working copy, or an upstream forge.

## Sessions and verdicts

A session has a name, participants, ordered stable change IDs, and the exact
commit versions captured when it was created. The Changes view follows explicit
Previous, Next and Open changes actions. A rewritten change retains its place;
a missing or divergent change remains visible and cannot receive approval.

Every verdict identifies its author and exact reviewed member versions. The
latest verdict for each participant is displayed. A new file edit, description
edit, changed membership, or missing member makes the old verdict outdated.
Immediately before saving, the controller resolves the changes again and
rejects a verdict if the displayed versions moved. File-reviewed marks still
belong to the core review-progress service; the plugin does not infer approval
from opening a file or from another participant's marks.

The queue lists sessions awaiting the current participant, ordered by remaining
personal file reviews, then creation time. Unknown file totals sort last.
A request-changes verdict completes that participant's current pass; it does
not imply approval or prevent later re-review. All sessions remain accessible.

Events are immutable JSON values, one key per event. Concurrent writes to
independent sessions do not overwrite a shared library record. Replay uses
timestamps and IDs deterministically; the controller makes timestamps monotonic
within its own instance. Imports reject conflicting event IDs. Partial storage
failures are explicit and retryable.

## Shared annotations

Review notes are core annotation threads with a `(plugin: review, session ID)`
context. The plugin reads, creates, replies, edits and resolves through the
host's scoped notes API. Threads keep their core IDs, authors, anchors, and
rewrite states. They remain visible in the ordinary Annotations view when the
plugin is disabled. There is no second thread store or localStorage identity. With a review selected,
“Add note to current review” in a change, file or hunk context menu opens its
composer with the exact core anchors. “Start review of selected changes” also
keeps scattered selections separate.

A note created from the session attaches to the exact current change version.
File and line anchors from imported/core threads render through the shared
TargetList. Rewrites do not silently retarget anchors.

## Split and exchange

Split is delegated to a core-owned dialog and guarded repository command. A
session records its intent before opening that dialog; the core's durable
receipt allows session membership to recover if the app closes after the
operation but before its plugin event is saved. Known inactive receipts restore
pre-split membership after Undo; unknown receipts imported from another
computer retain their recorded members with an explicit warning. Only unambiguous whole-file
ownership can project file marks and annotation targets. Ambiguous anchors
remain explicit.

A `gg.review` snapshot captures diff content, descriptions, participant events,
core annotation archives and displayed review marks. Reading an offline
snapshot does not require the captured commits to exist. Importing historical
marks never marks the current working copy reviewed. Old v1 snapshots remain
read-only evidence; their separate legacy comments are not imported as current
core threads.

## Validation

Model tests cover version-pinned verdicts, missing members, participant identity,
queue order, deterministic replay and split membership. Controller tests cover
persistent event replay, a rewrite racing with approval, repository disposal,
and selected-session note response races. Component tests cover creation,
timeline order, navigation and use of exact core annotation anchors.
