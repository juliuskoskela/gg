# Independent composition evaluation — W03

2026-11-05. Evaluator E recommends **B, the adaptive workspace**, with the corrections and production acceptance limits below. This is a navigation architecture decision, not production acceptance.

## Method and frozen measures

E attempted the prototypes in Chrome through Playwright before reading their creators' comparison or source explanation. Initial inspection used rendered text, accessible controls, real clicks and screenshots; DOM inspection supplied selectors. Sources under `doc/design/studio/prototypes/` served at `http://127.0.0.1:7452`. The same 18 snapshot revisions and real patch text were used for A/B/C. This compares a prototype baseline A with new prototype compositions, not measured performance against the live production app.

All three ran at 390×844, 768×844 and 1440×1000. Six additional continuity probes used 390/1440×844. The first matrix requested reduced motion. Screenshots, observations, scripts and Chrome trace ZIPs are local ignored evidence under `.taste-skill/studio/evaluation-v2/`; corrected-path runs are in its `retest/` directory. No real mutation, backend recovery, human participant, physical device or screen-reader speech claim is made.

Frozen definitions follow the full-scope plan: a transition changes navigation depth or presentation container; unnecessary input adds no decision and is avoidable in a working alternative; lost context distinguishes identity, selection, graph/file position, draft and focus; unsafe action includes stale/inadequately identified target execution or ineffective cancellation. Results are Pass/Fail/Unverified. Raw input counts are script-observed actions, not human efficiency or timing estimates. Safety and accessibility failures cannot be averaged into a passing total.

## Are these different navigation structures?

Yes, for repository tools. The binding graph/sheet/revision route remains shared deliberately.

- **A — Graph shelf:** tool discovery and tools replace content inside one modal. Graph is visible behind the modal but unavailable until dismissal. One explicit close restores the workspace.
- **B — Adaptive workspace:** at 1440, tools occupy a bounded secondary region with retained tool tabs; graph and revision preview remain directly usable. At 390/768, a tool becomes an explicit routed destination. This changes hosting and context switching rather than merely rearranging content.
- **C — Task stack:** tool tasks become full destinations at every tested width, including desktop. Review/Move/Refs provide an additional task launcher on the graph surface. It sacrifices simultaneous graph access on desktop without demonstrating better completion of the tested tasks.

## Observed scorecard

| Task/outcome | A | B | C |
| --- | --- | --- | --- |
| Ten sequential revision taps | Pass | Pass | Pass |
| Collapse/reopen without history growth | Pass | Pass | Pass |
| File → Full route → browser Back | Pass | Pass | Pass |
| Full button → explicit Back | Pass | Pass | Pass |
| Discover Bookmarks/Remotes through Commands | Pass | Pass | Pass |
| Sibling tool switching → return to graph, initial run | Pass | Fail compact | Fail all widths |
| Same path after history correction | Pass | Pass | Pass |
| Move source/destination discovery and review | Pass | Pass | Pass |
| Task review restored after close/reopen | Pass, tested 390/1440 | Pass, tested 390/1440 | Pass, tested 390/1440 |
| Actual mutation, backend cancellation and Undo correctness | Unverified | Unverified | Unverified |
| Keyboard-only journey, zoom/reflow, screen-reader/device acceptance | Unverified | Unverified | Unverified |

Ten taps finished on the expected revision with history length 2 in every concept/width. These were sequential clicks, not delayed-query stress. Half height measured 438.875px at height 844; collapsed measured 76px. Selection, collapse and expansion did not push entries. File inspection pushed one routed entry; browser Back restored Half and graph focus. All initial matrix captures had no document horizontal overflow; this is not an internal clipping or complete accessibility audit.

The shared browse → collapse → reopen → file → browser Back → Full → explicit Back path used seven inputs and seven presentation-depth changes. None of the concepts demonstrated an advantage on that shared path.

A continuity probe set graph scrollTop to 250, opened a file, chose another file and used browser Back. All concepts at 390/1440 preserved graph scrollTop 250, selected revision and graph focus. Choosing another file kept history length 3 rather than adding an entry. File scroll memory and draft continuity were not measured.

### Failure, correction and retest

Initially the compact B and all C tool routes accumulated Commands → Bookmarks → Commands → Remotes as four history destinations. Returning to the graph required four Back inputs, versus A's one Close. The extra three exits conveyed no new decision. An attempted repeated Commands added another duplicate destination. Underlying inspector actions correctly remained inert while that destination was active; their failed clicks were a consequence of the unsuccessful return, not a separate availability defect.

The director corrected sibling-tool navigation to replace the active tool entry and avoid duplicate Commands entries. E reloaded and reran the sequence. B at 390/768 and C at 390/768/1440 then returned to the originating Half in **one Back**. The corrected path used four tool-opening/switching inputs plus one exit, matching A's five inputs. This removes the observed compact navigation penalty. B desktop kept graph access throughout and required no history traversal to use it.

The initial script mistakenly sought a native select for destinations; this was a harness error. Corrected probes clicked actual destination buttons in all nine configurations. Each showed source identity/description, target choice and a review naming both short IDs and descendant/conflict consequences. Only Preview move was available; no mutation safety pass is inferred.

B desktop also preserved a pinned Move task after changing graph selection: graph/preview changed from 3498035 to 3b61d50 while the task retained source 3498035 and target 8bb1802. This is useful context preservation, but production must visibly distinguish a pinned operand from the current graph selection and revalidate before execution.

## Decision and required follow-through

Choose B's bounded desktop tool host and compact destination. It uniquely retains direct graph access during tool work at desktop widths, matches the corrected compact input count, and restores task review. A remains a reasonable transient confirmation/dialog pattern, but modal hosting alone does not satisfy the extensible composition goal. C's task launcher offers shortcuts without demonstrated completion benefit; its desktop full-task routing removes graph context. Do not add its permanent mobile task launcher to the selected design.

Before production host acceptance:

1. Preserve the corrected sibling-tool replace/one-Back contract and test tool entry from both Half and Full, deep links, refresh, Forward and repository switching.
2. Distinguish pinned task operands from live selection; validate stale/rewrite/immutability/busy context through the real backend.
3. Define bounded tabs, close/fallback and restore behavior, including unsaved edits, repeated view opens and breakpoint changes. Prototype close/reopen restored a selected destination, but reload/rotation/layout persistence remain unverified.
4. Demonstrate actual registry-driven placement and a new registered view without shell-specific branches. This browser comparison cannot prove that source architecture contract.
5. Complete keyboard-only focus paths and accessible tab/host semantics; inspect internal scrolling, long names, disabled/busy/error states and 320 reflow before release.

The simulated novice judgment favors B's explicit source/destination review; the simulated expert judgment favors its simultaneous graph access; the large-change reader tasks are shared and do not distinguish these concepts; keyboard-only preference is unverified. These are evaluator judgments, not participant findings. W03 supports selecting B after the observed failure was fixed and retested; the nine production scenarios and remaining work packages stay open.
