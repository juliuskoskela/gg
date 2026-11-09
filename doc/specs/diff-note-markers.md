# Diff line note markers

Open line notes appear beside the first anchored line in the diff gutter. Clicking or keyboard-activating a marker opens the existing annotation. Hover or focus uses the same preview as timeline and file markers. Multiple notes on one displayed line share one marker; old and new context notes share a control in unified mode.

A marker needs either its exact original commit or a verified unchanged new-side quote at the displayed commit. Split relocations use the effective owner and the computed anchor state, while retaining the original quote. Ambiguous, missing and changed anchors do not acquire guessed positions. Old-side anchors after rewrites remain unmarked because their quote has not been verified against the new parent.

For combined ranges, markers require the hunk's exact line provenance. Notes on unchanged context without such a mapping remain available in the annotation view. Old/new positions stay distinct in split mode; unified context positions are mapped from the patch, including unfolded gaps.

The renderer adds slotted controls to rendered gutter rows after each library render. It does not insert source lines or change line heights. Removed rows and disposed viewers unmount their controls and previews. Fold controls and their annotations remain owned by the diff library.
