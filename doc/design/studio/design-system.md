# GG+ workspace design system

The current implementation contract is [UI design sweep](../../reviews/ui-design-sweep.md).
Earlier sections below retain historical design decisions and verification records;
where they disagree, the current contract and production components take precedence.

## Direction

The revision graph is GG’s identity and working context. Its real topology, selected revision and working-copy marker should remain the visual anchor while an inspector reveals detail. Use IBM Plex Sans / JetBrains Mono, matching the owner’s `~/Repos/repo-docs` documentation template, neutral light and dark surfaces, and muted green graph semantics. Do not import terminal-dashboard cards, financial status colors, ornamental grids or a new font system from researched examples.

Desktop stays one workspace: graph and contextual inspector share one revision selection. Narrow layouts use one shared revision sheet with collapsed and half states; opening full inspection navigates to the canonical full route. Full is a destination, not a third oversized nested overlay. Keep graph state and scroll when returning. Sheet dragging begins only at its handle; scrolling descriptions, files or diffs must never move the sheet.

The hierarchy is repository chrome → revision graph → selected revision → contextual files/diff/actions. The graph’s circles and edges carry the memorable visual form. All surrounding chrome stays quiet. Use the same selected-row treatment across graph, files and navigation, while preserving the selected revision marker and text rather than relying on color alone.

## Exact additions to the incumbent tokens

| Token | Value | Role |
|---|---|---|
| `--space-6` | `32px` | larger structural separation |
| `--touch-target` | `44px` | touch controls and sheet handle hit area |
| `--focus-width` | `2px` | common keyboard focus width |
| `--focus-offset` | `2px` | common keyboard focus offset |
| `--motion-feedback` | `140ms` | existing hover/press feedback |
| `--motion-sheet-duration` | `220ms` | sheet settle within requested 180–250ms |
| `--motion-sheet-ease` | `cubic-bezier(.2, .8, .2, 1)` | prompt start and quiet settle |
| `--sheet-radius` | `12px` | exposed upper sheet corners only |
| `--inspector-peek-height` | `72px` | handle plus one revision identity row |
| `--sheet-half` | `50%` | half of the available workspace, not device screen |
| `--sheet-handle-width` | `32px` | visible drag indicator |
| `--sheet-handle-height` | `4px` | visible drag indicator |
| `--sheet-surface` | `var(--surface)` | theme-parity surface |
| `--sheet-border` | `var(--border)` | crisp boundary against graph |
| `--sheet-shadow` | `0 -4px 20px #09090b14` / `0 -4px 20px #09090b38` | light/dark separation |
| `--focus-ring` | `var(--accent)` | preserve existing high-contrast focus color |

No palette replacement: current blue accent remains for links/focus, muted green remains meaningful in the graph, red/green diff colors remain semantic. Selection is neutral. Apply 44px targets for coarse input and narrow sheet controls rather than inflating all desktop rows. At the default 16px browser setting, desktop UI is 13px, body 14px and code 12px. At widths up to 600px, UI is 14px, body 15px and code 13px. These semantic roles use rem units, with unitless prose leading and proportional diff leading. Mobile editable fields use at least 16px to avoid focus zoom. These are density/readability choices, not WCAG minimum font sizes. Use available-workspace height and safe-area bottom inset for sheet geometry.

Motion is interruptible, never a page entrance effect. Animate transform for sheet movement. Reduced motion resolves immediately while preserving the final state and focus. Focus must remain visible above sticky content; the collapsed handle offers a named button alternative to dragging. The half sheet is nonmodal and must not trap graph interaction; the full route restores ordinary page navigation.

## Initial critique and evidence

Method: adapted manual single-context review, not a complete upstream Impeccable critique invocation. Current baseline supplied by the studio at `.taste-skill/studio/baseline/mobile-fold.jpg` and `desktop-fold.jpg`; historical screenshot `.taste-skill/ui-sweep/desktop-light.png` is not current evidence. Browser CUA inventory returned no browsers/apps. Source review covers `App.svelte` and `global.css`.

Strengths: real revision topology dominates the narrow screen; compact Plex text fits meaningful revision descriptions; the selected working-copy row has a neutral fill plus graph marker. Existing semantic colors, light-dark token pairs and reduced-motion rule are a sound base.

Priority findings:

1. P1: `App.svelte` hides `.log-region` when `.compact.show-detail` is set. Inspection erases spatial context. Shared collapsed/half sheet must keep the graph behind it and reserve the full route for deep inspection.
2. P2: narrow top controls consume roughly 190px before the first revision. Avoid adding a second mobile title/action row inside the sheet when the same identity is already visible. Collapsed content needs only revision identity and expansion affordance.
3. P2: mobile baseline shows 32px desktop-size controls. Shared sheet header actions need 44px hit areas, explicit names and clear focus. Preserve dense graph text while making its interactive row hit area sufficient.
4. P2: the existing binary history/change state does not describe a partially open inspector. Sheet state must be separate from revision selection, canonical route and pane mode so selections update one inspector rather than opening duplicate layers.
5. P3: 140ms feedback exists as a raw global value. Introduce modest reusable motion/focus tokens without broad visual churn.

Verification still required after implementation: 320/390px widths, short landscape, 880px transition, both themes, long descriptions, selected graph row visibility, half-sheet inner scroll, handle pointer cancellation, keyboard expansion/collapse, route back restoration and reduced motion. A screenshot proves layout, not touch dragging.

## Research provenance and adopted guidance

Exact raw documents and SHA-256 hashes are archived in `.taste-skill/studio/skill-research/sources.json`. Retrieved 2026-11-05 over HTTPS; no installer or external executable run. Current Impeccable upstream places the requested commands under `skill/reference/*.md`, not separate command `SKILL.md` paths.

- [Impeccable shape](https://github.com/pbakaus/impeccable/blob/main/skill/reference/shape.md): adopt explicit job, outcome, states, boundaries and structural thesis. Override interview/stop cadence because the user already supplied detailed direction and requested implementation.
- [Impeccable critique](https://github.com/pbakaus/impeccable/blob/main/skill/reference/critique.md): adopt product specificity, cognitive load, hierarchy, evidence and priority findings. This scoped review does not claim its two-agent assessments, detector, overlay or heuristic score; those tools were not installed or invoked. No synthetic score or overlay claim.
- [Impeccable distill](https://github.com/pbakaus/impeccable/blob/main/skill/reference/distill.md): adopt removal of redundant identity/action chrome, progressive disclosure and no nested cards. Override generic single-column/full-width advice where keeping the graph and inspector together is the product requirement.
- [Impeccable adapt](https://github.com/pbakaus/impeccable/blob/main/skill/reference/adapt.md): adopt context-sensitive restructuring, safe areas, coarse-input targets, consistent IA and separate gesture evidence. Override automatic bottom navigation: GG’s narrow view is a graph workspace with shared contextual sheet.
- [Impeccable audit](https://github.com/pbakaus/impeccable/blob/main/skill/reference/audit.md): adopt verifiable contrast/focus/target/theme/responsive checks, severity labels and no unverified allegations. No full audit score until those checks exist.
- [Impeccable polish](https://github.com/pbakaus/impeccable/blob/main/skill/reference/polish.md): adopt incumbent-system preservation, narrowest correct fix, full-path verification and functional-before-cosmetic triage.
- [UI UX Pro Max SKILL](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md): adopt priority order (accessibility, touch, performance), semantic tokens, meaningful motion and detection of actual Svelte stack. Read its quick-reference and pro-rules as supplemental rules. Override new-system generation/database search because this is incumbent-system adaptation, no upstream scripts installed, and the brief fixes palette/type. The native-only pt/dp table is not a CSS-pixel requirement; use 44 CSS px as the chosen web touch target. Do not claim a database recommendation.

## Compact graph rows

The graph uses one 44px row per revision, with change ID, description and references vertically centered on the node. Repeated author rows are removed; authorship remains in preview and revision details. SVG node centers, edge endpoints, virtualization and keyboard reveal all use the shared `revisionRowHeight`. This keeps touch targets usable and avoids a second responsive graph geometry. Configurable columns remain a future presentation option rather than a new permanent toolbar.

The desktop Files divider uses the same quiet rule and visible focus treatment as the graph divider. Its larger invisible hit area supports pointer use without adding visual weight. A keyboard user can resize it with arrows or jump to the limits with Home and End.

## Integrated control and status audit

The follow-up rollout shares action geometry/states across links, buttons and panel toggles; primary action styling is a variant, not a separate interaction model. Inputs have semantic boundary/focus tokens; narrow editing fields use 16px text. Forced-colors preserves selection and focus. Rendered component tests verify 44px graph/touch targets, centered graph ID/description, and measured light/dark text/status contrast at least 4.5:1 and focus/control boundaries at least 3:1 against ordinary and selected surfaces. These selected component checks do not constitute whole-application WCAG certification.

Revision status names cover working copy, immutable, conflict and divergence; bookmarks expose tracked/untracked, sync/deletion and conflict state through text/accessibility names and compact glyphs. Author remains in preview/Details, leaving the graph's single 44px line aligned and compact. Full inspection keeps stable Back/identity/actions and drops the duplicate Changes count. Secondary repository tools use the same surfaces and type roles as the inspector.

## Font provenance

The UI and code stacks match `repo-docs/template/src/styles/palette.css`: IBM Plex Sans with platform sans fallbacks, and JetBrains Mono with SF Mono/Menlo/Consolas fallbacks. Fonts are bundled locally for native/offline use. JetBrains Mono normal weights 400, 500 and 600 are the unmodified official webfonts from [JetBrains](https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/webfonts); its SIL license accompanies the assets. Interface text keeps the existing Plex Sans 400/500/600 faces. Font synthesis is left available for unsupported weights, italics and fallback scripts rather than disabled globally. The shared code token reaches the diff renderer’s shadow styles as well as revision identifiers.

Graph identifier columns scale with the font so enlarged identifiers cannot overlap revision descriptions.

The final [accessibility and typography audit](accessibility-typography-audit.md) records measured contrast and browser zoom. Fixed-height chips and headings now grow with text, the Full identity yields space to its action controls, and virtual file rows measure the current type scale before calculating offsets.

## Panel chrome and live component catalogue

Open `/?design-system` on the frontend preview (currently http://127.0.0.1:7461/?design-system).
The catalogue imports the production `PanelTabs`, `PanelHeader`, `RepositoryNavigation`,
`ToggleTray`, `ToggleItem`, and `DiffDisplayOptions` components. It works without a repository
connection and includes a light/dark switch, tab selection/closing, navigation and control states.
Its code rows are illustrative specimens, not a live repository diff.

- **No selection underlines or side stripes.** This applies to tabs, repository tools, navigation,
  file rows and revision rows. Use a neutral selected surface and stronger text. Keyboard focus
  retains a complete visible outline; repository data and diff additions/deletions retain their semantics.
- **One panel, one title.** Files is the file navigator's title, with its count in the tab.
  Do not repeat Files/Tree inside it. Diff is the reader title; its tools row shows file count,
  additions and deletions without repeating a Changes heading.
- **One close action at the trailing edge.** `PanelTabs` owns the full-width header with a single
  close button for its active panel. It remains fixed while tabs overflow horizontally. Tabs support
  arrow keys, Home/End and one tab stop for the selected tab. Dragging and docking remain available.
- **Slim tabs.** The shadcn default filled-tab treatment is the reference, adapted to GG's existing
  type and palette. `--panel-tabs-height: 32px`, 24px tab targets on desktop, 6px control radius;
  narrow/touch headers expand to 44px. No new component library is required.
- **Continuous chrome.** `PanelHeader` owns the full-width surface and bottom rule. Inset its contents
  by `--panel-inset: 8px`; do not inset the header itself. `--panel-toolbar-height: 36px` sets tool
  row density. Dock splitters use a single 1px divider with a wider invisible pointer hit area.
  Pane bodies have no outer gutter that can interrupt nested headers, dividers or file surfaces.

Reference: https://ui.shadcn.com/docs/components/base/tabs (default filled variant).

## Description documents and metadata

The Description panel is a top-aligned document, not a collapsible summary. Show the
change's actual description title and body first, including for the working copy.
Use a ready-to-fill multiline field for an empty working-copy description. Existing
mutable text uses `EditableText`: quiet text at rest, neutral hover feedback, click or
keyboard activation to enter the editor. Keep drafts and full-width editing. There is
no pen button or visible Edit description label. Revision commands live in their own
Revision tools panel, available from Views. The old Details disclosure,
stored overview visibility preference and independent metadata scroll cap are removed.

`RevisionOverview` composes description text/editing and `RevisionMetadata`.
`MetadataList` and `MetadataRow` own semantic definition lists and consistent label/value
columns: labels and gaps scale with the UI type: `calc(var(--type-ui) * 80 / 13)` plus
`calc(var(--type-ui) * 16 / 13)` on desktop (80px/16px at 13px type), and
`calc(var(--type-ui) * 68 / 14)` plus `calc(var(--type-ui) * 12 / 14)` at narrow
viewports (68px/12px at 14px type). Labels can wrap within their column.
When the metadata container is 320px or narrower, every row stacks its label above its
value. Top-align wrapped content, rather than vertically centering labels against chips.

Use the same row structure for status, authorship, identifiers, bookmarks, tags and
parents. Bookmark lifecycle text stays directly beneath its own chip. References wrap
without clipping their names; parent revision objects retain their navigation and
merge/drop semantics. The document owns one scroll area and keyboard scrolling, so
long descriptions and extra metadata remain reachable in small dock panels.

The design-system preview's Description specimen uses the production components with
long local/remote bookmarks, a local-only reference, release tags and parent metadata.
Open `/?design-system#description` to review it in either theme.

Description redesign validation: 151 component tests and 13 workspace browser tests pass,
including description editing, save/undo, draft retention, references, and metadata visibility.
Production build, Svelte and Node/Vite type checks, formatting and Clippy pass. Browser
measurements at 320/390/768/1440px in both themes confirm one value alignment edge and no
horizontal overflow. Full-panel documents start 19px below the dock header in both themes.
Screenshot evidence is under `.taste-skill/description-redesign/`.


## Shared fields, inline editing and timeline sections

`TextField` and `TextAreaField` own ordinary text entry across timeline revsets, file
search, description editing, command search, destination selection, repository paths
and input dialogs. They share global field tokens for surface, borders, radius, hover,
focus and disabled states. Single-line and multiline fields preserve their native roles,
labels, bindings, input/change/keyboard events and focus references. The hidden Neovim
input and checkboxes keep their specialized behavior.

`EditableText` is an action with button semantics, keyboard focus and no underline or
side marker. It displays the description itself instead of an editing label. Hover and
focus reveal the affordance; editing replaces the text with `TextAreaField`. Cancel
restores focus to the text, or to the empty working-copy field. An empty field does not
steal focus when a revision is selected. Save/cancel controls appear after editing starts.

`RevisionTools` groups existing revision commands under Create, Rewrite and Remove.
It follows the shared selection and command registry; immutable, stale-selection and
pending-operation guards remain active and unavailable reasons remain visible. It is
an independent dock panel, openable from Views and movable like any other panel.

`TimelineSection` owns the complete timeline frame, summary and scrolling viewport.
The Pane header remains full-width. A shared 12px inset surrounds timeline content;
the inset belongs outside the virtual list so graph SVG geometry, row hit targets,
vertical virtualization and slot keys retain their existing coordinates.

Implementation was developed in independent Jujutsu workspaces `gg-fields`,
`gg-timeline` and `gg-revision-tools`, then integrated into the active workspace.

Shared-fields integration validation: 161 component tests and 14 workspace browser tests
pass. Coverage includes native field binding/event forwarding, inline edit and focus return,
empty working-copy input, draft persistence, save/undo, independent tools panel lifecycle,
command protection, and timeline gutter geometry. Build, Svelte/Node type checks, formatting
and Clippy pass. Live review confirms 12px timeline gutters on both sides, no page overflow
on desktop/phone, and no editing label or revision menu inside Description. Evidence is in
`.taste-skill/inline-fields/`. The three worker workspaces retain their original changes for
review; the active workspace contains the integrated implementation.

## Panel title bars and fixed footers

Timeline's preset and revset fields live in the fixed bottom bar, outside the graph's
scroll area. Its count remains above the graph. Density uses the shared themed icon
toggle (`TimelineDisplayOptions`) in the title bar; its pressed state means tall rows
with revision authors. The choice still persists and preserves the graph reading anchor.

Diff's file count, additions/deletions and five display toggles are composed by
`DiffTools` in the dock title bar through the shared `PanelTabs` tools slot. There is
no second tools row inside the docked diff body. The close button stays at the trailing
edge. Tool content can wrap within narrow title bars; ordinary header icons reserve
their own space so the scrolling tab strip never overlaps them.

`PanelFooter` provides a full-width surface and top rule, fixed at 49px on desktop or
61px for narrow/coarse input. Timeline fields and the diff's previous/next file buttons
and current path use this same component. Both footers stay outside content scrolling.
Wide title bars remain 32px tall in both light and dark themes.

Verification: 161 component tests, 14 workspace browser checks, whole-file diff controls,
persisted density/reading-anchor behavior and compact touch density checks pass. Live
measurements confirm matching 32px desktop headers, matching 49px footers and common
bottom alignment in both themes. At 320/390px, tab switching, close placement and all
diff controls remain reachable without page overflow. Evidence:
`.taste-skill/panel-placement/`.

## Shared state contract (November 2026 sweep)

Solid actions use `accent-solid`, `accent-solid-hover`, `accent-solid-pressed` and
`text-on-accent`. Destructive filled states use `danger-solid`, its hover/pressed
variants and `text-on-danger`; `negative` remains the foreground/diff role.
Primary pressed treatment wins over hover. Buttons retain a 32px minimum but grow
with text; relative leading preserves the 20px desktop baseline. On narrow/coarse
input, shared panel controls and toggle trays reach 44px, within 56px title/tool bars.

Resting field outlines use the quiet `control-border` through `input-border`,
following the owner’s Paseo reference calibration; disabled fields remain quiet. Invalid fields use `negative` with a visible explanatory message.
Keyboard focus uses the full-strength focus token. Floating menus use the opaque
`popover-surface`, `radius-popover` and `shadow-overlay`; drawer backdrops use `scrim`.
Docked panels retain their flat surfaces and neutral selection.

`graph-edge` is a topology role independent of separators: light #c8c8c0, dark
#40403d, with a 1.5px stroke. The owner rejected the stronger 3:1 palette as visually
dominant. Keep connectors subdued; nodes, revision text and selection carry the
stronger cues. This choice does not claim 3:1 connector contrast.

The catalogue now renders `ActionWidget`, `ProgressWidget` and an actual `DiffViewer`
with a local typed change fixture, alongside production fields, tabs and toggles.
Its light/dark switch stays local and passes a theme override to the diff renderer;
viewing specimens does not save a user preference. Error, disabled, loading, empty
and selected states are available, with live hover/pressed and keyboard focus states.
This supersedes the earlier illustrative-code-row description above.

## Text enlargement and virtual history geometry

Metadata label widths and gaps scale with `--type-ui`; long labels wrap instead of
painting over values. The normal 80px/16px desktop and 68px/12px narrow geometry is
preserved. The existing narrow-container stacked layout remains available.

History measures one hidden CSS row in `LogPane`, following the UI type and density.
Baseline compact desktop/touch/tall heights remain 28px/44px/60px; doubled UI type
produces 56px/88px/120px. One measured height drives list keyboard navigation,
virtual slice offsets, row foreignObjects, graph endpoints and the preserved reading
anchor. Tall title/author/gap geometry scales together (22px/18px/2px baseline).
Explicit author space reaches graph stations and edges, so enlarged tall rows do not
rely on comparing their total height with a fixed 60px number. Slot-index keys remain.


## Quiet surface hierarchy

The owner’s Paseo Progress reference supersedes the first sweep’s stronger field
boundaries and blue-black canvas. Dark chrome and content share #1f1f1e, with
#2b2b2a rules and #343433 container hairlines. Input surfaces are #232322 with
#3a3a38 resting borders. Keep the complete focus ring for keyboard interaction.
Light mode follows the same close neutral steps. Selected rows are neutral,
reference chip colors/fills/borders are subdued, and outline icons use a 1.5px stroke.
See the [current measurements and palette](../../reviews/ui-design-sweep.md#paseo-reference-calibration).
