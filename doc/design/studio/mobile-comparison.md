# Structural composition comparison

W02 prototype delivery, 2026-11-05. These isolated read-only compositions test navigation architecture, not production readiness. No concept is scored here; independent evaluation owns the comparative outcome.

Run `python -m http.server 7452 --bind 127.0.0.1` from repository root, then open `http://127.0.0.1:7452/doc/design/studio/prototypes/index.html?concept=A`. Header links switch to B and C. Sources and bounded snapshot are versioned in `prototypes/`; no build or production imports are required. Existing Plex font assets supply the incumbent typography. Quiet blue selection, compact graph rows and author in details intentionally remain constant so styling does not bias architectural comparison.

## Hypotheses declared before evaluation

| Composition | Structural choice | Tradeoff to test |
| --- | --- | --- |
| A — Graph shelf | Graph and contextual sheet; global tools temporarily occupy a modal, returning to the same underlying revision. | Least navigation ceremony, but repository tools interrupt graph interaction and cannot remain visible beside inspection. |
| B — Adaptive workspace | On desktop, tools occupy a bounded persistent secondary host with at most three switchable tabs. Revision preview remains beside it. On compact screens tools become routed destinations with Back. | Persistent tools support repeated switching while retaining revision context, at the cost of horizontal graph space and differing compact/desktop presentation. |
| C — Task stack | A persistent task rail leads to review queue, move workflow and refs. Source revision then destination choices form a navigable task stack; commands are destinations rather than a modal workspace. | Explicit tasks and source/destination review can improve action orientation, at the cost of deeper navigation and more Back transitions. |

All share the binding revision selection → half preview, 76px summary-only collapsed state, dedicated handle interaction, full revision/file destination and Back to prior preview. Their tool composition, destination depth, discovery entry points and restoration differ; the alternatives are no longer merely reordered half-sheet content.

## Comparable tasks

Use the same revision in each: third graph row, `snapshot.js` order. Select it; collapse and expand with the handle; inspect its first file; scroll patch; return to preview; reopen file; invoke Commands; find Move revision; choose a destination; inspect the preview; cancel/Back to revision. Compare keyboard Ctrl/Cmd K, Escape, tab traversal and retained graph position. Also open Edit description and inspect the exact target preview. B desktop additionally opens multiple tools, switches tabs and closes the current tab; C opens Review queue and selects a source. Record transitions/input counts and failures independently; these task-specific interactions are deliberately different.

## Fixture and limits

The same original real-history snapshot contains 18 Git revisions rooted at `8bb1802`, at most eight actual changed paths per revision, and at most 9000 characters of actual `git show` output per file. `snapshot.py` regenerates this fixture from an explicit Git repository and revision. The snapshot has no authoritative bookmarks/remotes/operation data; those tool destinations say so instead of inventing entries. Description and move actions are target-aware read-only previews. No production IPC, backend mutation, conflict resolver, live loading, undo recovery or large-history performance is claimed.

`node doc/design/studio/prototypes/verify.mjs` captures half, file and move states at 390/768/1440 using Chrome and records page exceptions, graph scroll return and document overflow. Set `GG_TEST_BROWSER` if Chrome is elsewhere. Evidence is intentionally ignored under `.taste-skill/studio/compositions/`; source harness and fixture remain versioned. Physical keyboard occlusion, device touch feel and screen-reader speech require separate checks.

## Creator verification

Chrome exercised all nine concept/width combinations: no page exceptions, no document horizontal overflow, and stable graph scroll after file → Back. Twenty-seven screenshots capture half/file/move. These observations establish those bounded paths only, not a comparative winner. Representative B desktop move and C narrow move captures were visually inspected. B retains description drafts while switching tools; move destination selection is retained while navigating the study. This intentionally simple harness does not implement a general production persistence service.
