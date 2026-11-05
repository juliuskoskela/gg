# Historical GG+ mobile interaction exploration

This document records the initial content-priority exploration. Its Graph shelf / Review deck / Command HTML and screenshots were local ignored artifacts under `.taste-skill/`; those historical files are not included in the repository and the former serving instructions are not reproducible from a checkout. The behavior and verification claims below describe that historical iteration, not the current versioned prototypes.

For the runnable structural A/B/C comparison, see [mobile-comparison.md](mobile-comparison.md) and [prototypes/index.html](prototypes/index.html). From repository root run `python3 -m http.server 7452 --bind 127.0.0.1`, then open `http://127.0.0.1:7452/doc/design/studio/prototypes/index.html?concept=A`; header links select B or C. Run `node doc/design/studio/prototypes/verify.mjs` against that server (set `GG_TEST_BROWSER` for Chrome or `GG_PROTOTYPE_URL` for another server address). The current harness checks all nine concept/viewport combinations plus task-source/draft isolation and desktop Full → Commands → Move regressions. It writes ignored screenshots, traces and assertion results under `.taste-skill/studio/compositions/`.

## Historical exploration record

## Sources and design decisions

Inspected `app/Shell.svelte`, `app/revision/RevisionFiles.svelte`, existing font assets, and actual `git log` / `git show`. The snapshot includes the last 18 revisions from `8bb1802`, their actual changed paths (up to 8 each), and up to 9000 characters of actual diff per file. This is a bounded snapshot; it does not imply a live workspace or complete large diff. IDs displayed are Git commit IDs, not fabricated jj change IDs. No invented counts of additions/deletions. The file status M is a generic modified affordance and does not distinguish additions/renames in this prototype.

Applied local `frontend-design/SKILL.md`: product-specific graph surface, Plex type, restrained blue selection, semantic graph rails. Tokens: background `#f5f6f8`, surface `#fff`, ink `#202633`, muted `#626c7c`, rule `#d8dde5`, selection `#e2eafa`. Typography uses the existing IBM Plex Sans asset and the browser’s monospace stack. Narrow screen alignment stays left; desktop is a graph/detail split rather than an enlarged phone.

Read upstream instructions directly, without installers:
- [prototype](https://github.com/emilkowalski/skills/blob/main/skills/prototype/SKILL.md): genuinely different interaction models, isolated surface, realistic content, no production imports. Adaptation: picker is a compact static dark pill rather than copying its animated highlight, because these are full-height mobile tools and the explorer must stay visually subordinate.
- [mobile-native](https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md): `100dvh`, viewport-fit, safe-area support, contained scroll, 16px inputs, explicit button press feedback, no zoom disabling. Real hardware remains required.
- [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md): state changes explain spatial continuity; sheet uses transform only, 240ms drawer curve `cubic-bezier(.32,.72,0,1)`. Frequent concept switching is instant. Reduced motion removes sheet travel. No animation library installed. Adaptation: bounded handle drag selects snap states on release; this is not a physics spring implementation.

## Compared directions

| Direction | Primary job and interaction | Cost |
|---|---|---|
| Graph shelf | Revision opens overview, revision actions, and changed-file list. Each file opens a full-height detail, then Back returns to the previous sheet state. | Most direct continuity with current GG, but requires an extra tap before reading a diff. |
| Review deck | Revision immediately opens first file's actual diff, with horizontal file tabs and a later jump list. | Fast review start; revision summary and other files are less prominent. Tabs must scroll for many files. |
| Command | Revision opens a filterable action list, then changed files; global tools/search also reachable with Ctrl/Cmd K. | Makes the action vocabulary discoverable, but adds chrome and pushes file content lower. |

All three share the requested graph-selection → half sheet → peek/full → file → back state machine so the divergence can be judged on task priority rather than breaking navigation. At 390px, half sheet leaves the upper graph uncovered. At 1440px, graph remains visible to the left and the lower portion of detail opens as a shelf. Peek/Half/Full buttons provide alternatives to gestures. Selection and graph scroll are preserved because the graph DOM stays mounted and the sheet never scrolls it.

## Actual behavior versus hypotheses

Implemented: revision selection, explicit sheet states, handle-only pointer gesture snapping, inner content scroll, file opening with actual patch text, return to prior sheet size, close back to selected graph row with preventScroll, retained selected state, instant mode picker, searchable tools, read-only tool previews, revision search, keyboard Escape and Ctrl/Cmd K. Tools use native dialog focus behavior. Editing/new revision/undo never call IPC or mutate the live repository; they open target-aware previews. This is interaction exploration, not functional repository editing.

Hypotheses requiring user evaluation: whether first-diff Review deck is faster than overview-first Graph shelf; whether the handle is discoverable; whether Peek contains enough context; whether the command direction earns its extra vertical space. No usability acceptance claimed. Hardware testing is needed for iOS safe areas, browser chrome resizing, keyboard resizing, and gesture feel. Desktop Chromium screenshots can verify geometry and DOM state, not those hardware properties.

The historical six-case verification captured 390×844 and 1440×844 across all three initial concepts. Its local `verification.json` recorded console exceptions and graph selection/scroll return checks, with screenshots in the ignored historical prototype directory. These are historical observations, not outputs of the current versioned harness linked above.

## Binding state specification update

Collapsed/Peek is now 76px and shows only handle, revision ID, and summary; its action bar and other details are hidden. Closed sheet is both inert and visibility-hidden. Full pushes exactly one `#revision/<commit>[/file/<path>]` browser-history entry; Full-to-file does not add another. Browser or visible Back returns to the prior half/collapsed state. Half selection does not push history. This is a standalone hash-route demonstration; production should use its established routing boundary. Initial deep-link hydration is not implemented in the prototype.

Verification executed with locally installed Google Chrome through Playwright: all six concept/viewport combinations produced no page exceptions, retained selected revision, and retained graph scroll after the tested open/peek/full/file/back sequence. Twelve comparison screenshots are present. This verifies the implemented paths; it does not establish usability acceptance or physical-device gesture behavior.
