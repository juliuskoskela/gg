# Reviewing selected changes

A linear selection displays the diff from the oldest change's parent tree to the newest change's tree. The Files pane and diff footer identify the selected change that last changed each file. Each combined hunk links to the latest change contributing surviving edits to that hunk, which can differ from the file's latest change.

Line provenance is computed by replaying each selected change in chronological order. Unchanged lines retain their source revision and source coordinates; newly added lines receive the current revision and coordinates. Original lines remember their remover. Restored original lines regain their base identity, so removing them again is attributed to the later remover. This preserves ownership when later changes insert lines before earlier edits, replace prior additions, or revert part of the selection.

Provenance is serialized as contiguous runs to avoid repeating revision IDs for every line. Each run maps combined old/new-side line positions to the exact original revision's old/new-side coordinates. Notes on a combined hunk or changed-line selection use those mappings and may have several targets when several changes contributed. They never attach to a synthetic range identity. Unchanged context without an attributable edit, binary content, conflicted content and unavailable mappings are not assigned a guessed line owner.

A range hunk is not directly editable as one originating patch: it may combine several revisions. The range UI exposes origin navigation and annotation, while single-change views retain their normal hunk operations.

Ctrl/Command selections display separate review cards, one diff per selected change. Shift selections crossing a nonlinear part of the graph use the same representation rather than silently stopping at the first branch boundary. API ranges containing a merge or nonlinear ancestry display an explicit explanation and per-change cards for every resolved member.

Review marks remain file/change marks, not partial-hunk marks. In a combined view a file's mark belongs to its originating change; review a contributing change directly when finer ownership is needed.
