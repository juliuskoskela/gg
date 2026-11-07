# Typography system

Components choose a type role, never a raw size. Each role fixes size, line height and weight together, in `app/global.css`. The timeline is the reference: 13px text on 20px lines, 12px secondary text, ids in the code face.

| Role | Token | Spec | Use |
| --- | --- | --- | --- |
| Title | `--font-title` | 600, 15/22 | What a view is about: a revision's summary, a note, an operation |
| Heading | `--font-heading` | 600, 13/20 | A section inside a view; dialog titles |
| Emphasis | `--font-emphasis` | 500, 13/20 | Names, setting names, and the chosen item in a list |
| Body | `--font-body` | 400, 13/20 | Values, list items, controls, short explanations |
| Prose | `--font-prose` | 400, 14/22 | Paragraphs people wrote: descriptions and notes, at most `--prose-measure` (72ch) wide |
| Label | `--font-label` | 400, 12/18 | Keys, captions, counts and metadata, always in `--muted` |
| Id | `--font-id` | 400, 12/18, JetBrains Mono | Change and commit ids, hashes, paths, `workspace@repository` |

Ink has three steps: `--text-strong` for titles, headings and the chosen item; `--text` for content; `--muted` for labels and help. Weight never stands in for colour, and values are never bold.

## Rhythm

`--gap-row` (4px) separates rows of one list, `--gap-group` (12px) related groups, and `--gap-section` (20px) sections, which also get a hairline rule. Key/value lists are one grid: keys share a column sized to the longest key, keys and values share baselines, and the pitch is 24px. The size and ink step between key (12px, muted) and value (13px, text) divides them without rules.

## Lists of entries

`LogList` (`app/controls/LogList.svelte`) shows history-like entries on one 28px line: code, title, badge, who, when. Columns, badge tone, a trailing snippet for row controls and in-place renaming are props. Evolution and History use it; new logs should too.

## Editable text, links and toolbars

Text that can be edited in place reads as text, with a pencil glyph at rest on the field that names the edit, a field tint on hover, a focus ring, and a tooltip naming the action. An editable empty description reads "Add a description". In-content navigation uses `.text-link`: body text with a quiet underline, never a filled button.

Toolbar tools sit at the trailing edge. What scopes or summarises the view takes `.toolbar-lead` and sits at the leading edge: search fields, counts, select-all and view filters.

## Validation

`RevisionPane.test.ts` checks that keys and values align and the empty-description invitation. Theme-family tests measure the contrast of rendered text and controls in all nine variants.
