# UI design sweep

GG keeps its dense revision workspace: IBM Plex Sans for interface text, JetBrains Mono for code and IDs, neutral selected surfaces, semantic revision nodes and a dockable inspector. No component library or dependency was added. Sol and Terra implemented the sweep in separate named Jujutsu workspaces; their changes are integrated on `ui/design-sweep`.

## Current design contract

- **Hierarchy:** repository controls frame the workspace; the graph establishes context; the selected revision leads into Description, Files and Diff. Avoid decorative cards, colored navigation stripes and repeated panel headings.
- **Graph:** connectors are supporting structure, not the dominant mark. Current `graph-edge` is `#c8c8c0` in light mode and `#40403d` in dark mode at 1.5px. The owner rejected the initially stronger edge palette. Keep nodes and selected revisions more prominent. Connector contrast is intentionally below the earlier 3:1 target; do not describe this as whole-application WCAG compliance.
- **Surfaces:** chrome and content share #1f1f1e in dark mode. Light chrome/content use #f5f5f3/#fafaf9. Use `raised` for a small elevation step, `popover-surface` for opaque floating menus, and `scrim` for modal backdrops. Resting hairlines and input boundaries stay quiet; hover, selection and keyboard focus supply stronger emphasis. Reserve restrained shadows for floating UI; docked panels stay flat.
- **Color roles:** `text`, `muted` and `text-disabled` express text hierarchy. `accent` is a foreground/focus role; filled buttons use the separate `accent-solid` family with `text-on-accent`. Destructive filled states use `danger-solid` and `text-on-danger`; `negative` remains appropriate for destructive text and deletion data. Do not reuse a foreground red as a white-label button fill.
- **Spacing:** use the existing 4/8/12/16/24/32px spacing scale. Panel content insets are 12px, adjacent controls 8px, tool groups 12px, title bar block padding 5px. Panel controls are 28px in 40px desktop headers, expanding to 44px in 56px narrow/coarse-input headers. Ordinary actions have a 32px minimum and grow with their text.
- **Typography:** use semantic rem-based roles, with 13px desktop UI, 14px body and 12px code at a 16px root setting. Narrow UI/body/code become 14/15/13px. Editable narrow fields stay at least 16px. Preserve readable line height; do not lock enlarged labels into fixed-height boxes.
- **Shape:** use 6px control radius, 8px surface/popover radius, 1.5px icon strokes, and full visible focus rings. Keep native select behavior and the shared Feather chevron. Avoid one-off icon styles or unthemed colors.
- **Headers:** each panel tab owns its own adjacent close button. Summary comes before its controls; independent hide/wrap toggles stay separate from the exclusive diff layout group. Tools align trailing and wrap below tabs when necessary. Headers and footers stay outside scrolling content.
- **Responsive controls:** narrow repository chrome uses identity and action rows. Undo, Commands and More remain immediately available; remote, synchronization and secondary recovery actions remain in More. Diff layout labels appear when their panel has room.
- **Selection and focus:** selection uses a neutral surface and stronger text; focus remains a distinct complete outline. Tab navigation preserves arrow/Home/End behavior. Pointer focus must not reposition a tab before its click completes.
- **Enlarged text:** metadata label columns and timeline geometry grow with the type scale. Graph rows, edge endpoints, node centers and virtualization share measured geometry; resizing preserves the reading anchor. Compact/tall defaults remain 28/60px, with a 44px coarse-pointer compact default.

## Shared component policy

Use the existing production Svelte controls as the component library. New feature code should compose them rather than copy their CSS:

| Concern | Shared implementation |
| --- | --- |
| Actions | `ActionWidget`, `ActionLink`, shared action styles |
| Text entry | `TextField`, `TextAreaField`, `EditableText` |
| Native choices | `SelectWidget` and global select tokens |
| Panel structure | `PanelTabs`, `PanelHeader`, `PanelTools`, `PanelFooter` |
| Toggle groups | `ToggleTray`, `ToggleItem` |
| Revision metadata | `MetadataList`, `MetadataRow`, shared ID/author/time components |
| Overlays | `ContextMenu`, `ModalDialog`, shared surface/scrim tokens |
| Diff rendering | `DiffViewer`, `DiffTools`, `DiffDisplayOptions` |

The live catalogue at `/?design-system` imports production actions, fields, tabs, toggles, metadata and the real diff renderer. It includes selected, disabled, invalid, loading and empty examples. Its theme switch is local to the catalogue and does not overwrite the user's saved theme. Keep adding meaningful component states there as features change.

## Changes and observations

- White labels on dark-theme primary actions previously measured about 4.11:1, falling to 3.50:1 on hover. Separate solid roles now measure 5.61:1 and 4.94:1; pressed state measures 7.34:1.
- Destructive context-menu focus previously used an unsuitable foreground color as its fill. The dark default solid pair now measures 6.32:1, with tested hover and pressed pairs.
- The first pass raised field borders to about 3.80:1 dark and 3.76:1 light. The owner rejected the resulting harshness using Paseo Progress as the reference. Resting borders now measure 1.38:1 in both themes, while focus uses the full-strength focus role. The earlier 3:1 resting-boundary assertion is superseded by this explicit visual direction; do not claim whole-application WCAG conformance.
- Revision identifier suffixes now use readable secondary text on selected/hovered rows. File names yield space to consistently trailing status/counts. Folder tooltips expose the full path.
- Menus use one opaque surface and radius; drawers and command/destination overlays use the common scrim.
- Dialogs establish initial focus, contain Tab navigation, restore prior focus, and preserve native Cancel behavior. Enter submission ignores IME composition and already handled keyboard events.
- Binary and metadata-only file changes now show an explanatory status instead of a blank diff reader.
- Compact tab clicks exposed a focus/scroll race. Keyboard focus still reveals tabs; pointer focus no longer changes the clicked tab's position before activation.
- Metadata and graph rows no longer overlap at the reviewed 200% text size. Tall rows scale title/author spacing and node geometry together.

## Verification and remaining work

Production screenshots were reviewed at 2048, 1440, 768, 390 and 320 CSS pixels in both themes. The page did not overflow horizontally and no page errors were captured. The catalogue inspector reported no blocking findings; warnings concerned disabled specimen labels, intentional sparse sample content, and timeline/chart classification. Separate scroll captures cover the catalogue's lower sections.

Final verification: production build and Svelte check passed with zero errors/warnings; the existing large syntax-chunk warning remains. All 183 component tests passed. The 31 affected browser tests passed across final targeted runs; the other 41 browser tests passed in the broader run. The broader run preceded the final scroll, touch-width and binary-state fixes, so these totals describe full-suite coverage plus focused reruns, not one final monolithic run. Cargo formatting, Clippy and diff whitespace checks passed. Local evidence is in `.taste-skill/ui-design-sweep/`; the initial detailed audit and component inventory are in `/tmp/gg-ui-audit/`. The focused implementation reports are [shared controls](ui-design-sweep-system.md) and [workspace](ui-design-sweep-workspace.md).

Remaining structural work:

- Crowded revision references still clip. A safe `+N` disclosure requires separating row selection from the nested reference buttons and preserving keyboard/drag/drop semantics. Full reference names remain available in Description metadata.
- Native Tauri/WebKit, OS-native select popups, screen-reader navigation and every repository-dependent recovery state were not exhaustively exercised. Browser screenshots and selected contrast assertions do not certify the entire application.
- The 200% text probe now verifies graph and metadata geometry; it is distinct from native application zoom and is not an assertion that every possible dock arrangement and translation fits.

## Paseo reference calibration

The owner supplied a GG workspace screenshot and a Paseo screenshot with its Progress panel open. Sampled flat areas in Paseo use #1f1f1e for the panel and #343433 for hairlines. GG previously used #111318 content against #0a0b0e chrome, blue-tinted selection, and #667080 input borders. The new shared theme adopts the reference's small neutral surface steps, rather than assigning strong contrast to every rectangle.

| Role | Light | Dark |
| --- | --- | --- |
| Ground | #f5f5f3 | #1f1f1e |
| Content | #fafaf9 | #1f1f1e |
| Raised | #ffffff | #252524 |
| Quiet rule | #e7e7e2 | #2b2b2a |
| Container hairline | #deded8 | #343433 |
| Field surface | #f7f7f5 | #232322 |
| Resting field border | #d5d5ce | #3a3a38 |
| Selection | #e6e6e0 | #323230 |

Reference chips use less saturated colors, 4% tinted fills and 12% tinted resting borders. Selected chips use 20% borders. Icon strokes are 1.5px; floating shadows are lighter and omit the previous inset highlight. Active panel tabs use the hover surface so they remain visible when the canvas and header share a ground. These rules are shared tokens/component styles, not per-panel overrides.

Measured in the production browser, light/dark: body text 12.12/11.10:1, secondary text 5.88/6.74:1, placeholder text 5.23/5.22:1, focus against fields 5.49/6.86:1. Rules measure 1.19/1.16:1 and container hairlines 1.29/1.32:1. Resting field borders intentionally measure 1.38:1. Text and focus checks remain in the regression suite; resting borders no longer inherit their thresholds.

Verified the production build in both themes at 2048, 1440, 768, 390 and 320px, plus the working-copy editor, menus, command palette, gallery states and focused fields. No page errors or page horizontal overflow were captured. All 183 component tests pass; Svelte check, production build, formatting and Clippy pass. No behavior or geometry changed in this calibration. Evidence: `.taste-skill/quiet-workspace/`, including `contrast.json` and the light/dark working-copy screenshots.
