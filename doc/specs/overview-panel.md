# Revision overview and persistent navigation

Revision details always sit above the diff. The disclosure row contains the
revision description's first line, with its expand chevron immediately before
it. This title stays visible when metadata is collapsed. Empty descriptions use
`(no description set)` in muted, regular 13px text, matching the timeline. There is no right dock,
resize divider or saved dock width; old docking preferences are ignored.

The expanded body contains the remaining description, author, authored date,
commit identity, bookmarks and parents. The title is not repeated in that body.
Editing controls live beside the disclosure and become icon-only in narrow
layouts. Editing opens the details and uses the full available width. Drafts
survive selection changes, collapse and viewport resizing.

The existing neutral palette, IBM Plex typefaces and quiet shared selection
states remain. The revision header has a single-line 16px description, and the
details disclosure uses 13px text. Description body text is 14px regular. Author,
authored date and commit have explicit 12px labels. Parent descriptions wrap in
narrow layouts. Parent selection and drag-and-drop behavior remain available.

Desktop navigation is persistent at viewport widths of 768px and above: a 56px
icon rail expands to 224px and pushes the workspace aside. The bottom toggle and
chosen expansion state persist. Selecting a view leaves navigation expanded.
Smaller viewports retain the modal drawer and restore focus on dismissal.

The workspace header owns the stable History, Revision and Files controls.
The file tree sits on the right of the entire revision area, spanning both
description details and diff. On phones it overlays that same area from the
right. Expanding repository navigation does not change this behavior.
