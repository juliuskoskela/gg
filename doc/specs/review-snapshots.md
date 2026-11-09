# Portable review snapshots

The review plugin exports `gg.review` version 2 documents. Each document has a stable snapshot ID, capture time, original session and event history, current captured member versions, exact patches, a shared annotation archive, rendered annotation records and personal review marks as recorded at capture. Capturing does not mark anything reviewed.

Capture resolves stable change IDs to current commits, reads those exact commits, then rechecks every current version after collecting notes and marks. A concurrent rewrite aborts with a retry message. Missing changes are recorded explicitly. Original session membership and verdict versions remain intact, so the offline view can identify verdicts that differ from the captured code. Marks count only when their evaluated commit matches the captured version.

The offline viewer uses captured patches and the shared sanitized Markdown renderer. It does not query commits, write annotations or restore marks. Version 1 documents from the review candidate remain readable with their original patches, comments and identities. Legacy comments stay read only; they do not create a second live thread system.

Documents are limited to 32 MiB and validated before storage or rendering. Patch line counts must match their ranges. Review events, member identities, annotation ownership and duplicate IDs are checked. The plugin stores text in UTF-8-aware chunks whose serialized values are at most 1 MiB, below the host's 4 MiB per-value limit. SHA-256 digests check each chunk and the complete document.

Chunks and manifests are addressed by content. The manifest is written last, so failed writes never appear as complete snapshots. An existing snapshot ID cannot silently acquire different content. If two windows concurrently import conflicting documents, both payloads survive and subsequent reads report the conflict. Interrupted writes may leave unreferenced chunks; retrying the same document reuses them.

Importing session events and shared notes is separate from saving or opening a snapshot. The controller preflights event collisions, and the core annotation API owns annotation import validation. Captured review marks are historical information and are never sent to the live reviewed-mark API.
