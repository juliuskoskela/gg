# Repository actions for scattered selections

Ctrl/Command-click selections offer two atomic repository actions. Each confirmation lists every selected change, its exact commit and description.

- **Abandon selected** abandons only those changes. Unselected descendants remain and are rebased onto surviving parents.
- **Rebase each onto…** makes each selected change a direct child of one destination. Selected changes become siblings, even when one previously descended from another. Unselected descendants follow their rewritten parents; conflicts may result.

Both requests carry an explicit list of revision IDs, never a range spanning the first and last selection. The worker resolves and checks the complete list before changing any commit. Duplicate, missing, rewritten and stale working-copy versions fail without a partial operation. Rebase also rejects destinations in the selection or its descendants. Immutable protection covers the selected changes and affected descendants. Each successful action is one operation and can be undone normally. A change already directly on the chosen destination stays untouched; if every selected change is already there, rebase returns unchanged.

Changing the selection, repository, protection mode or operation state while a confirmation is open cancels it. Drag-and-drop remains limited to continuous ranges. Squash, insert and other range actions stay unavailable for scattered selections: their semantics would need a separate explicit design rather than silently including intervening changes.
