# Lines

Every line in GG is a border with a role. The role picks its colour; the width is always the same. Lines that follow these rules land on whole device pixels at any display scale or app zoom and read at the weight their role intends.

## Why one width

GG's desktop app zooms with WebKit page zoom (`app/display/zoom.ts`), in steps such as 1.5 and 1.75. At those zooms a CSS pixel is a fractional number of device pixels. Browsers snap a border's painted width to whole device pixels, but they don't snap gaps, offsets, `box-shadow` spreads or 1px-tall backgrounds the same way. So two lines that both say "1px", one a border and one a gap, can paint one and two device pixels wide, or blur. When every line is a border of the same `--line-width`, they all snap the same way.

`--line-width` is `--hairline`: the painted width of a 1px border at the current device pixel ratio (`app/hairline.ts`). Never write a literal `1px`, `0.5px` or `1.5px` for a line.

## Roles

| Role | Token | Where |
| --- | --- | --- |
| Seam | `--line-seam` | Between views, and the sheet's edge against the topbar, navigation and footer. Only `DockFrame` and `WorkspaceSurface` draw seams. Never inside a view. |
| Rule | `--line-rule` | Anything inside a view: where a title bar, toolbar or footer meets content, between sections, between a pane and its neighbour (tree beside editor), table and list separators. Fainter than a seam. |
| Popover rule | `--line-popover` | Dividers inside raised surfaces: menus, popovers, dialogs, sheets, the command palette. |
| Control | `--line-control` | The outline of a control or object inside a view: inputs, selects, buttons with an outline, chips, cards, specimens. Also the structure of written content, such as table grids, quote bars and rules in notes, which a faint rule would lose on a light surface. |

State lines are not structure and keep their meaning colour: a drop target (`--accent`), an error (`--negative`), a selection bar. They use `--indicator-width`, never a bare `2px`. Keyboard focus uses `outline: var(--focus-width) solid var(--focus-ring)`.

The edge of a floating surface (menu, popover, dialog, tooltip) uses `--line-popover` like its dividers, so a menu reads as one object.

## Drawing

- Draw a line with `border-*: var(--line-width) solid var(--line-…)`. Not `box-shadow`, not an `::before`/`::after` with a background and a 1px height, not a default `<hr>`. A styled `<hr>` is fine: `height: 0; border: 0; border-block-start: var(--line-width) solid var(--line-popover)`.
- Exactly one element draws each line. Where a header meets content, the header draws its bottom rule and the content draws no top rule. Where two siblings meet, the earlier one draws it. If a component needs a line on a side it doesn't own, it doesn't get one.
- Lines run edge to edge of the surface they divide. Inset a rule only when the inset itself carries meaning (a menu divider inset to the item text).
- A view draws no line on its outer edge; the seams are its edge. Panes inside a view (a file tree beside the editor) are divided by a rule, not a seam.

## Corners

Views are square (`--view-radius`). Controls use `--radius-control`, raised surfaces `--radius-popover`, small marks `--radius-sm`, badges and pills `--radius-pill`. No literal radii.

## Enforcement

`npm run check` runs the design-token lint (`doc/design-token-lint.md`), which rejects literal line widths, line colours outside the tokens above, `box-shadow` and thin pseudo-element backgrounds used as lines, and literal radii. `e2e/line-audit.test.ts` opens every view in light and dark and checks each visible line's width and colour against its role, so a regression fails the suite rather than reaching a screenshot. It also fails on two lines that share an edge. A glyph drawn with borders (a checkbox tick) sets `--line-glyph` so the audit skips it.
