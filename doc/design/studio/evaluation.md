# Independent adversarial evaluation

Earlier “pending” entries below describe the initial concept review, not the final integration status. The generated workload, responsive matrix, rapid-query and large-file checks are recorded in [validation](validation.md).

## Method and evidence

Evaluator E used Chrome through Playwright against actual baseline `http://localhost:6973` and the three standalone prototypes served on port 7432. The evaluator did not read the creators' implementation or design explanation before inspecting the screens. Initial captures use 390 × 844 and 1440 × 1000 viewports. Prototype contexts request reduced motion. Evidence and runnable scripts are in `.taste-skill/studio/evaluation/`; `initial-observations.json` contains DOM observations, and `interactions.json` records URL, history length, focus, headings, and overflow per transition. Trace ZIPs contain screenshots and snapshots.

Baseline was read-only: 22 revisions were reported. Prototype UI reports 18 snapshot revisions. No live-repository mutation was attempted. No task time, real participant success rate, 100-revision performance, or 30-file performance is claimed. Persona assessments below are evaluator judgments, not user research.

## Repeatable scenarios

| # | Scenario and procedure | Pass evidence required | Current coverage |
|---|---|---|---|
| 1 | Browse 100 revisions, scroll away, select ten rapidly, return | latest selection wins; stable scroll; graph focus retained; no history entry per tap | 18 snapshot revisions inspected; scale not tested |
| 2 | Open revision with 30 changed files, inspect deep file, Back twice | file-focused full route; first Back restores half/collapsed selection and scroll; second leaves workspace | 8-file sample and Full/Back exercised; 30 files pending |
| 3 | Edit multiline description, save, reopen | exact saved text and one backend change; cancel preserves original | isolated fixture only; pending |
| 4 | Touch rebase via explicit source/destination choices | identities and consequences reviewed before mutation; cancel safe | pending functional fixture |
| 5 | Make isolated reversible change, inspect Undo explanation, recover | Undo names affected operation and restores state | Tools offers Undo preview; backend recovery pending |
| 6 | Reach future registry view then return | destination integrated without replacing revision identity or swallowing Back | future-view architecture judgment only |
| 7 | Desktop keyboard graph navigation, edit, file inspection, split resize | visible focus, no focus theft, usable minimum pane widths | 1440 captures only; keyboard/resize pending |
| 8 | Conflict, immutable revision, multi-selection, missing/loading/error | exact disabled reason or recovery action, no accidental mutation | unsupported snapshot states; pending fixture |
| 9 | Phone 390 portrait, small landscape, keyboard viewport, long text, reduced motion, interrupted handle gesture | 64–80px action-free collapsed summary; handle-only gestures; recoverable cancellation; content unobscured | portrait and reduced-motion context measured; other dimensions pending |

## Concept comparison

Scores are provisional evaluator judgments on a 1–5 scale, where 5 best serves the task. They measure the visible direction, not production correctness. Shared functional gaps are recorded separately so a single shared bug does not erase the distinction among concepts.

| Criterion | Graph shelf | Review deck | Command picker |
|---|---:|---:|---:|
| Rapid revision orientation | 5 | 3 | 4 |
| Diff inspection emphasis | 3 | 5 | 2 |
| Discoverable revision actions | 4 | 2 | 5 |
| Low interruption during browsing | 5 | 3 | 3 |
| Future destinations fit | 4 | 3 | 5 |
| Total /25 | 21 | 16 | 19 |

Graph shelf is the provisional recommendation: the revision summary, identity and file list provide a useful middle level before entering a full destination. Review deck is visibly different because diff content and file tabs become the immediate inspection surface; it is stronger for focused review but consumes limited half-sheet space. Command picker visibly prioritizes destinations/actions; it accommodates expansion but asks users to choose an action before understanding the revision. All three share the same history and sheet skeleton, so divergence is in task emphasis rather than entirely different navigation models.

## Measured findings before route revision

1. In all three prototypes, selecting a visible revision and clicking Peek, Half and Full succeeds with real pointer clicks. Selection, Peek and Half do not increase browser history (length 2 throughout), as required.
2. Full also leaves URL and history unchanged. Browser Back then reaches `about:blank`. This fails the binding full-destination contract; Full must create one meaningful entry and restore the originating sheet state on Back.
3. At 390px the document does not horizontally overflow in any of the three measured states. This does not prove internal diff readability or keyboard viewport behavior.
4. Hidden initial sheet content is exposed to accessibility locators and body text. A direct Peek click before selecting a row finds the control but is intercepted by the workspace. The first attempted test incorrectly treated that as an active-sheet failure; after selecting a row all controls worked. Hidden content should be inert/hidden from the accessibility tree.
5. The captured Graph shelf Peek occupies approximately the bottom 160px of the 844px viewport and displays Back/Peek/Half/Full controls. It does not satisfy the 64–80px action-free collapsed summary contract. The prototype switcher also overlaps the summary.
6. Tools opens a repository-tools dialog and states that actions preview their results on a read-only snapshot. These prototypes cannot establish mutation safety, contextual undo, conflicts, immutability or multi-selection correctness.

## Implementation retest

Pending selected implementation. Repeat the scenarios above on an isolated generated fixture with at least 100 revisions and a 30-file revision. Record browser behavior separately from simulated persona judgment. No production acceptance is implied by this provisional concept recommendation.

## Selected implementation: independent retest

Actual browser testing used the isolated fixture at port 7441, not the development repository. Screenshots `impl-*` and `final-*` and Playwright traces are in the evaluation evidence directory. Some probe scripts were reused between runs; screenshot filenames preserve the individual observed states, while JSON records only the most recent run of that script. This is a functional audit with simulated persona judgments, not a participant study or timing benchmark.

| Task | Actual observed result | Remaining limit |
|---|---|---|
| Browse → half → file → Back | Selecting rename revision kept URL `/` and history length 2. File c.txt opened `?inspect=<commit>&file=c.txt` and history became 3. Browser Back restored half preview. | 22 revisions, not 100 |
| Collapse | Preview collapses to summary-only button; no revision actions remain in collapsed button list. | Interrupted gesture sequence not audited |
| Description | Multiline isolated description saved; contextual `Undo: describe commit` restored original. Focus initially went to body; after root fix textarea receives focus with name `Revision description`, and Cancel restores Edit button focus. | Actual OS keyboard not tested |
| Touch move | Commands → Move revisions → destination `yupnommu` → explicit MOVE confirmation rebased selected `wnpusytq`. Contextual `Undo: rebase commit …` restored graph. | Typed revset workflow; no visual destination chooser |
| Full global commands | First implementation exposed an overlapped global Commands target that could not receive a click. Root added Full header Commands; its real click opens palette and focuses search. | Background Commands still appeared in role query during retest; should be excluded from accessibility tree |
| Files | Choose changed file opens picker and focuses `Filter changed files`. | 2-file sample; 30-file picker not audited here |
| Immutable | Half says Immutable; protected commands display `Immutable revisions are protected`. | No attempted bypass/mutation |
| Missing revision | Invalid inspect commit displays `Revision not found / This revset matches nothing.` | Network failure and loading not induced |
| Desktop | ArrowDown selects next revision and leaves focus on graph list. Native drag of rename onto unrelated rebases; Ctrl+Z restores initial graph. | Resize separator not exercised |
| Responsive | Full screenshots at 390×844, 844×390, 390×420 and 1440×1000 had no document horizontal overflow. Reduced-motion requested in context. | 390×420 is resized viewport simulation, not an actual mobile keyboard; long labels not generated |

All three mutations (description, touch move, desktop drag) were undone on the isolated fixture. Original 22-revision ordering and original description were observed again.

### Improvement scorecard

These are qualitative evaluator judgments against the same visible tasks, not measured user success rates.

| Dimension | Initial prototype Graph shelf | Selected implementation | Evidence basis |
|---|---:|---:|---|
| Browse / inspection continuity | 3/5 | 5/5 | Full now routes once, file is focused, Back restores half |
| Collapsed graph room | 2/5 | 5/5 | Action-heavy ~160px prototype replaced by summary-only collapsed control |
| Safe actionable workflows | 1/5 | 4/5 | Actual save/undo and typed MOVE/undo on isolated backend |
| Keyboard continuity | untested | 4/5 | Graph ArrowDown retains graph focus; editor focus fixed and retested |
| Recovery clarity | 2/5 | 3/5 | Specific describe/rebase label helps; after undo label becomes opaque `Undo: undo: restore to operation <long hash>` |

The implementation materially improves the central browse/inspect/return flow. Simulated novice judgment: MOVE confirmation is safer because it names both full change IDs and warns about descendant rewriting/conflicts, but descriptions/bookmarks would make identity verification much easier on a phone. Simulated expert judgment: typing a revset is usable, although a destination chooser would reduce recall. Recovery after an Undo remains hard to interpret when a long operation hash replaces the action description.

No claim is made that the nine-scenario matrix is fully covered: generated 100-revision/30-file workloads, registry integration, multi-selection, network errors, long labels, real keyboard occlusion and interrupted gestures require separate evidence.

### Final read-only fix verification

A final Chrome run on isolated port 7441 verified the corrections, without further mutations. Evidence: `final-spot.zip`, `final-spot.json`, and `spot-*.png`.

- Full now exposes exactly one Commands button to a role query; the overlapping background command is excluded. The remaining Full command opens the palette and focuses its search input.
- Entering description editing focuses `TEXTAREA` named `Revision description`.
- Undo after recovery now reads `Undo earlier operation`, removing the long restore-operation hash from the command choice.
- MOVE confirmation visibly names the source and destination descriptions, short change and commit IDs, and bookmarks. It retains the descendant/conflict warning and explicit MOVE requirement. The dialog was cancelled.
- `Commands → Current operation` opens the operation tool and focuses `Close repository tool`. It explains that repository operations are separate from revision history and points back to Commands for Undo. The raw restore-operation hash remains in this technical detail view.

The previously outstanding command exposure and MOVE identity findings are resolved in this spot check. Recovery clarity score rises from 3/5 to 4/5 as an evaluator judgment: the command is legible while the operation detail remains available. This does not extend the workload or device coverage recorded above.
