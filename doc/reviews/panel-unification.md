# Workspace panel design unification

The paneling implementation is preserved at `rescue/paneling-before-design-20261105`
(commit `f97a5f54`). This change retains docking, split resizing and compact panels.

The visual reference is shadcn's default filled tabs, adapted to GG's existing palette,
IBM Plex Sans, radii and density. Desktop and compact docks now render `PanelTabs`;
diff tools and file headers use `PanelHeader`. Header surfaces and rules span their panels,
with content insets inside the header. Splitters are a continuous 1px rule, with a larger
pointer hit area above adjacent content. Pane bodies no longer inset nested surfaces.

Active tabs and navigation use neutral surfaces, without underlines or side stripes.
A single close button stays at the trailing edge and closes the active panel. Files has
one title and its count in the tab; Diff has one title and a separate summary/tool row.

## Review surface

`/?design-system` renders the production components without requiring a repository.
It includes a theme switch, tabs with close actions, file-row selection states,
repository navigation, tool controls, typography and surface tokens. Code rows are
illustrative specimens. The selection rules are recorded in
`doc/design/studio/design-system.md`.

Screenshots and browser measurements: `.taste-skill/panel-unification/`.
Checked light and dark at 320, 390, 880 and 1440px: no page overflow; close action
8px from the header's trailing edge; one title per Files and Diff panel. The real
workspace was inspected in both themes with a loaded revision diff. The production
component preview passes the app-screen inspector with zero failures; its remaining
contrast warning concerns the intentionally disabled control, exempt from WCAG text
contrast requirements.

## Validation

- Frontend production build and Svelte check: passed, zero Svelte errors/warnings.
- Component suite: 150 tests passed, including tab keyboard navigation and active-panel closing.
- Targeted browser coverage: 34 checks passed across workspace, inspector and whole-file diff
  suites (32 in the combined run; two rendering-timing checks passed on targeted rerun after
  waiting for panel visibility and virtual row placement).
- Node/Vite TypeScript check, `cargo fmt --check`, and `cargo clippy`: passed.
- Corrected a splitter hit-testing regression exposed by the browser drag check.
- Updated preserved paneling tests to select compact tabs explicitly, use a changed revision
  for file-surface geometry, and assert full paths through the compact filename tooltip.
- Desktop tab strips measure 32px; narrow/touch strips measure 44px.
