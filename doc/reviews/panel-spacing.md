# Panel structure and spacing

Panel title bars use the shared `PanelTabs` component. Each tab groups its label and close control into one surface. Active and inactive tabs can be closed independently. Panel tools sit at the trailing edge. Header backgrounds and divider strokes extend across the full panel width; content insets belong inside those boundaries.

| Token | Value | Use |
| --- | --- | --- |
| `--panel-inset` | 12px | Header, footer and panel content inset |
| `--panel-gap` | 8px | Adjacent controls |
| `--tool-group-gap` | 12px | Independent groups of tools |
| `--panel-bar-padding` | 5px | Title bar block padding |
| `--panel-control-size` | 28px | Header controls; 44px on touch |
| Title bar height | 40px | 56px on touch |

Single titles and stacked tabs keep their tools on the same row at every width. Tools keep priority at the trailing edge; the tab strip scrolls and clips into a 12px fade before them. Selected and keyboard-focused tabs are revealed, including after resizing. In extremely narrow split panes, the tool area can scroll horizontally without shrinking controls or adding a row. Timeline and Diff use the same production title bar and spacing conventions.

The design-system preview at `?design-system#panel-spacing` documents these rules beside production Diff and Timeline header examples. Preview controls inherit the shared component styles and tokens; the gallery does not provide its own replacement title bars.

Active tabs and selections use a neutral background and stronger text. Underlines and side stripes remain prohibited. Keyboard focus keeps a complete visible outline.

Validation: 206 component tests and 55 browser checks cover panel chrome, crowded tabs, narrow tool scrolling, docking, all nine themes, Settings and popup focus. Build, Svelte checks, Clippy, formatting and diff checks pass. Screenshots are recorded in `e2e/results/title-bars/` and `e2e/results/themes/`.

Close buttons remain siblings of their named tab triggers within a shared surface. Closing an inactive tab preserves selection; closing the active tab restores focus within its group. Delete closes the focused tab. Pointer drags from a close button cannot start docking.

## Lighter title bars

The panel title is contextual chrome around a code/history workspace. It should identify the view without competing with syntax, graph stations or the workspace brand.

    [ Timeline   Description   Diff 13   ··· clipped ]  [hide wrap] [layout]
    [ Diff 13                                    ]  [hide wrap] [layout]

The first row is a tabbed group; the second is a standalone, movable view. Both use the same height and trailing tool alignment. A single view keeps plain title semantics and the same active pill as a selected tab. The redundant six-dot grip is removed; its grab cursor, move tooltip and keyboard docking remain. Close icons retain the existing hover stretch, keyboard reveal and touch visibility, and do not get an independent hover surface.

- Header surface: 72% content surface + 28% outer ground. It belongs to the content layer with only a slight material distinction; do not add a visibly raised third band.
- No header rule. Rules mark the edges of views (the 1px dock dividers); inside a view, title bars, toolbars and footers stand apart from content by their lighter surface alone. Tool group outlines: 10% text.
- Focused view: the view holding focus, title bar included, traces its whole edge with a 1px inset `--view-focus-ring` (20% text over the surface; `Highlight` in forced colours). It replaces per-surface outlines such as the terminal's and Neovim's. Clicking plain content focuses the view, so the edge follows the pointer as well as the keyboard. Controls inside keep their own keyboard focus outline.
- Title and active-tab text: normal foreground, IBM Plex Sans 13px/20px, weight 500. Inactive tabs: muted foreground, weight 400. Counts: 12px, weight 400. Existing zoom scaling remains unchanged.
- Selected tab: one soft fill at 6% text over the header. No accent stroke, shadow or tab-strip enclosure. Focus retains one neutral outline, inset so clipping cannot cut it off.
- Overflow: only tabs move beneath the fixed trailing tools. Native horizontal scrolling and roving arrow/Home/End navigation stay available. The fade reverses in RTL and is removed in forced-colors mode.

The direction was checked against the brief before implementation: hierarchy comes from typography and a small surface step, keeping the user's restrained color system and hover-close behavior. No new component library or font is needed.

References applied selectively: [Apple toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) for stable, recognizable action placement and restrained grouping; [Material tabs](https://github.com/material-components/material-web/blob/main/docs/components/tabs.md) for same-level content and [its overflow implementation](https://github.com/material-components/material-web/blob/main/tabs/internal/tabs.ts) for revealing the active/focused tab; [shadcn tabs](https://ui.shadcn.com/docs/components/tabs) for foreground/muted hierarchy and restrained active surfaces. GG+ preserves its own neutral selection and single focus stroke rather than adopting library-specific decorations.

Pointer interaction and keyboard focus have separate presentation. Mouse-opened popups restore the trigger's focus without carrying the search input's keyboard ring back onto it. Pointer-focused fields keep their resting border. Tab, arrow navigation and keyboard activation restore the neutral focus indicator; closing a mouse-opened popup with Escape alone does not switch input modality. Focus stays in the correct place rather than being blurred to hide the ring.

## File-tree density

Folders, files and virtualized file rows share `--file-row-height`: a 24px desktop minimum and 44px minimum for touch/coarse pointers and narrow screens. The token grows with text size. File rows use 2px block padding; inline diff/resolve actions fit the same row without increasing its height. Folder and file labels align, and both tree renderers use the same panel gutters. Large lists measure this token for their scroll geometry, so row selection and keyboard navigation match the visible spacing.
