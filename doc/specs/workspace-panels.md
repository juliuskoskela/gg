# Workspace panels

GG+ is a repository work surface. History navigation, revision context and file
navigation should remain predictable while the user reads and reshapes changes.
Apply the frontend-design skill through restrained structure and consistent
interaction, keeping the existing IBM Plex Sans/Mono typography and role tokens.

Palette: shell #111113, surface #18181a, text #c9cbd0, metadata #a5a7ae,
immutable markers #789181 and focus #9ebbd4. Light mode uses the corresponding
existing roles. No new decorative treatment or typeface is introduced.

```text
History [toggle]  Jump to working copy  | Revision identity + actions | [Revision] [Files]
History / revset                       | Description title and details | Files
Revision graph                        | Diff / revision module        |
```

One persistent header owns all three panel controls. History anchors the leading
edge. Revision and Files anchor the trailing edge, in that order. Their visible labels,
size and DOM position do not change when panels close or queries load. Closing
the last content pane is disabled; the other pane can always be reopened. On
small workspaces History and Revision select the visible view, using the same
controls. Files is disabled while the revision is hidden or unavailable.

This header replaces the integrated history title/control row and revision
header. It does not add a row of chrome. Primary actions move into overflow when
the available header width is narrow; phones retain the revision action bar.

Files occupies the right side of the entire revision workspace, spanning the
description title, metadata and diff. It never changes mode because repository
navigation expands. Below the 768px viewport breakpoint it overlays this complete
revision area. The shared Files control remains outside the overlay, at the same
position, and is the single visible visibility toggle. Escape and file selection
close the phone overlay and restore focus to that control. File names can reveal
the current file, but no second toggle appears inside the tree or diff toolbar.

Hidden file browsing stays mounted to preserve filtering and folder expansion.
Selected files, diff scroll and description drafts survive panel visibility
changes. Revision query states do not remount the shared controls.

Review with recorded Playwright paths on isolated fixtures: desktop and touch,
all visibility combinations, resizing, selection, file navigation, descriptions,
menus, keyboard focus, empty/error states and repository operation workflows.
Record issues and evidence, fix defects within this pass, and retain explicit
limitations for paths that cannot be exercised.
