# Design token checks

`npm run check` runs the token linter and its regression tests before Svelte's type check. No browser or Rust build is required for these checks.

## Rules

- **Typography:** outside `app/global.css`, use `font: var(--font-body)` (or another `--font-*` role), rather than independent `font-size`, `line-height`, `font-weight`, or a literal font shorthand. Inherited font shorthands are allowed.
- **Color:** use semantic variables, including in gradients, borders and shadows. Literal hex, color functions and named colors are rejected. `transparent`, `currentColor`, inheritance and system colors for forced-color behavior are allowed. `color-mix()` may combine semantic variables. Only custom-property definitions in `app/global.css` and `app/display/palettes.css` may define literal colors.
- **Lines:** borders and outlines follow `doc/specs/lines.md`. A width is `0`, `none`, `var(--line-width)`, `var(--focus-width)` or `var(--indicator-width)`; never a literal (`1px`, `1.5px`, `thin`) or a `var()` with a literal fallback. A colour is a role (`--line-seam`, `--line-rule`, `--line-popover`, `--line-control`), `transparent`, `currentColor`, a forced-colors system colour, or one of the state marks that keep their meaning colour: `--accent` (drop targets, selection), `--negative` and `--warning` (errors and warnings), `--focus-ring` and `--view-focus-ring` (keyboard focus, the focused view's trace), `--field-focus-border` (a focused field) and `--control-hover` (a hovered control outline). `color-mix()` and other tokens are rejected: a mixed line colour is a new weight. `box-shadow` without blur but with an offset or spread draws a line that won't snap, so it is rejected; a `::before`/`::after` rule that is 2px or thinner and paints a background is rejected for the same reason.
- **Radius:** `border-radius` is `0`, `50%` or a token (`--radius-sm`, `--radius-control`, `--radius-surface`, `--radius-popover`, `--radius-pill`, `--view-radius`, `--sheet-radius`).
- **Spacing:** use `--gap-row`, `--gap-group`, `--gap-section`, or the existing semantic spacing/size tokens for nonzero `gap`, `row-gap`, `column-gap`, `margin*` and `padding*`. Zero resets, `auto`, inheritance and token expressions are allowed. Literal fallback sizes in `var()` are also checked. Widths, positions, borders and graph geometry are not layout rhythm and are outside this rule.

The check parses Svelte style blocks and template styles, CSS files, and style assignments/CSS strings in JavaScript, TypeScript and Svelte scripts. Test fixtures are excluded. Dynamic values are not evaluated: controllers must still source them from semantic tokens or the measured geometry they represent. Shader data, repository text and arbitrary color strings are not presumed to be UI styles. This is a source guard, not proof of runtime contrast; the color-vision tests remain separate.

## Existing styles

`scripts/design-tokens/baseline.json` records existing declarations so enforcement does not redraw the app during this refactor. Each allowance matches the exact file, rule, selector/at-rule scope, property, normalized value and occurrence count. Moving a declaration to a different selector, changing a value or adding another occurrence fails. Line-number changes do not. Removing a violation also fails until its stale allowance is removed.

Do not regenerate the baseline to accept new code. Fix new findings with tokens. When migrating old styles, remove only the corresponding baseline entries. Review baseline changes like source changes. The baseline is intentionally a temporary inventory, not an exemption for entire files or features.

## Narrow exceptions

Occasionally literal values belong to a renderer protocol rather than the interface design. Put a specific reason immediately before that one declaration:

```css
/* design-token-allow spacing: separator tracks the external renderer's one-pixel rows */
gap: 1px;
```

The same block-comment form works immediately before a script style assignment. The rule name is `typography`, `color`, `spacing`, `line` or `radius`; the allowance applies only to the next declaration and only to that rule. A reason of at least 16 characters is required. Never add a broad feature or file exemption. The Neovim glyph atlas uses three such exceptions: measured font metrics, protocol emphasis, and its white alpha mask (the final color is applied separately). Line exceptions cover things drawn with borders that aren't lines: the note checkbox's tick (which also sets `--line-glyph` so `e2e/line-audit.test.ts` skips it), CodeMirror's text cursor, and the transparent borders that inset scrollbar thumbs.

To investigate a failure, run `npm run lint:design`. It reports file, line, rule, property, value and selector scope. Run `npm run test:design` when changing the linter; its fixtures include inline styles, script assignments, nested CSS, raw colors, named colors, token colors, duplicate baseline entries and narrow exceptions.
