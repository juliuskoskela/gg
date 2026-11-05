# Panel structure and spacing

Panel title bars use the shared `PanelTabs` component. Each tab groups its label and close control into one surface. Active and inactive tabs can be closed independently. Panel tools sit at the trailing edge. Header backgrounds and divider strokes extend across the full panel width; content insets belong inside those boundaries.

| Token | Value | Use |
| --- | --- | --- |
| `--panel-inset` | 12px | Header, footer and panel content inset |
| `--panel-gap` | 8px | Adjacent controls |
| `--tool-group-gap` | 12px | Independent groups of tools |
| `--panel-bar-padding` | 5px | Title bar block padding |
| `--panel-control-size` | 28px | Header controls; 40px on touch |
| Title bar height | 40px | 52px on touch |

At a panel width of 520px or less, Diff tools wrap onto a separate row and remain aligned to the trailing edge. The tabs and their close controls stay on the first row. Timeline tools use the same production title bar and spacing conventions.

The design-system preview at `?design-system#panel-spacing` documents these rules beside production Diff and Timeline header examples. Preview controls inherit the shared component styles and tokens; the gallery does not provide its own replacement title bars.

Active tabs and selections use a neutral background and stronger text. Underlines and side stripes remain prohibited. Keyboard focus keeps a complete visible outline.

Validation: 168 component/model tests and 32 E2E tests pass, including responsive chrome at 1440px, 390px and 320px, tool clicks, docking and workspace behavior. Build, Svelte and Node type checks, formatting, Clippy and diff checks pass. Desktop and narrow screenshots are recorded in `.taste-skill/panel-spacing/`.

Closable-tab follow-up: close buttons are siblings of their named tab triggers within a shared tab surface, avoiding nested interactive controls. Closing an inactive tab preserves selection; closing the active tab restores focus within its group. Delete closes the focused tab. Pointer drags from a close button cannot start docking. Validation: 174 component/model tests and 13 panel-chrome/docking E2E tests pass, plus build, type, format, Clippy and diff checks. Screenshots are in `.taste-skill/closable-tabs/`.
