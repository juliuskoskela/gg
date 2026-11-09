# Shared review annotations

This foundation for issue #16 keeps plugin review conversations in core annotations.
A thread can carry immutable context metadata (`plugin`, `id`); review uses its
session ID. Ordinary core annotation views and CLI still read these threads.
The plugin host offers scoped list/create/reply/edit/status and exchange methods,
with separate write and exchange capabilities. It binds plugin and workspace
identity itself. The backend rejects writes to a thread outside the requested
context and rejects requests for a different active workspace.

`gg.annotation-bundle` v1 contains immutable annotation headers and their events,
including IDs, timestamps, authors and original anchors. Import requires the
requested context on every thread. It validates bounds, paths, event IDs and
post authors before writing. Matching IDs merge idempotently; conflicting headers
or events reject the bundle before writes begin. New threads are assembled in a
staging directory before becoming visible. I/O failure during an existing-thread
merge can leave a partial append; importing again completes it without duplication.
Imported notes need not have commits in the receiving repository. Their original
anchors remain intact and core reports missing/unknown/rewrite state normally.

Bundles carry annotations only. Captured reviewed marks are snapshot evidence,
not authorization to mark current files reviewed. Live marks remain in core review
storage. Snapshot capture and rendering belong to the bundled review plugin.

Navigation capability lets a plugin select an existing revision/file and open
one of its own registered views. The host rechecks instance validity after async
resolution and before changing core selection. It exposes no raw repository
mutation function. The separately guarded split flow will use the same boundary.

Storage tests cover offline round trips, author/ID retention, idempotent merge,
cross-context rejection, conflicting events and invalid paths. Host tests cover
capabilities, namespace binding and stale navigation. The real web transport test
restores a deleted local thread from its bundle and verifies core sees the same ID.
