# Browser suite recovery

Issue: https://git.digimuoto.com/juliuskoskela/gg/issues/5

The November 9 baseline reproduced 13 failures in the four suites named in the issue. Tests run against the production frontend and a temporary repository; no user repository is modified.

| Suite and case | Cause | Correction |
| --- | --- | --- |
| gg-plus: description drafts and persistent navigation | Desktop close actions collapse until their tab pill is hovered | Hover the pill before clicking its close action |
| gg-plus: independent revision tools | Two ID-copy commands were added to the original thirteen actions | Assert the named copy and revision commands instead of an exact total |
| gg-plus: highlighted diffs and file search | Collapsed desktop close action | Use the same hover-and-close interaction |
| gg-plus: fixed controls and file alignment | Collapsed desktop close action | Use the same hover-and-close interaction |
| gg-plus: file browser through navigation changes | Search moved to the view toolbar, outside the file-list landmark; closing also requires hover | Locate search by its accessible name at view level and hover before closing |
| gg-plus: phone file browsing | The revision row is an option rather than a button; clicks on tab-pill padding fail to select a tab | Select the row by role; make the whole tab pill activate its tab |
| workspace-inspector: file search and scroll restoration | Clicks on tab-pill padding fail to activate Files | Handle the pill's pointer click while preserving the tab's keyboard handler |
| workspace-inspector: file 20 and graph anchor | Same tab activation bug | Same fix |
| workspace-inspector: virtualized list over 200 files | Same tab activation bug | Same fix |
| workspace-inspector: move selected file | Same tab activation bug | Same fix |
| studio-acceptance: deleted and binary files | Same tab activation bug | Same fix |
| studio-acceptance: visible phone keyboard focus | The test only recognizes outlines and shadows, while fields use a contrasting border | Verify that the focused border differs from the resting border and reaches 3:1 contrast |
| review-accessibility: nested file browser | Same tab activation bug | Same fix |

A component regression test checks activation from both the tab label and the pill padding, exactly once. The existing close-button test verifies that closing never also selects the tab. Browser tests continue to exercise real pointer and keyboard input; none are skipped or force-clicked.

The shared harness gives browser actions a ten-second timeout so a missing control produces a useful failure instead of consuming the entire two-minute test budget. Backend startup retains its separate two-minute build allowance.
