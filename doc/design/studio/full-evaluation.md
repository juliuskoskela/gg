# Independent implementation evaluation

2026-11-05. Evaluator E independently exercised the integrated implementation through Chrome/Playwright at `http://127.0.0.1:7451`, backed by isolated `/tmp/gg-studio-full-lnpixydj`. No mutation targeted the user's repository or port 6973. This report establishes the observed paths below, not completion of all nine production acceptance scenarios.

## Method and evidence

The implementation was changing during this review. Findings were sent to the director immediately; corrected paths were reloaded and attempted again. These are observations of the integration working tree, not a frozen release commit. Final-commit verification remains the director's gate. E did not author production features or accept F's test results as independent evidence.

Actual clicks, keyboard shortcuts, rendered screenshots and Playwright traces are under ignored `.taste-skill/studio/full-pass/evaluator/`. `implemented.json`/`mobile.zip` record an early navigation pass; `retest-mobile.json`/`retest-mobile.zip` record corrections. `retest-mutations.json`/`retest-mutations.zip` record the corrected Move/Undo. `contexts.zip`, `hunk-execute.zip`, `hunk-recovery.zip`, `file-bookmark.zip`, `file-recovery.zip`, `bookmark.zip`, `remaining-mutations.zip`, `hunk-restore.zip` and `desktop.zip` preserve their named paths. Backend read-only `jj` observations independently checked original revision IDs and bookmark presence. Some initial scripts stopped after locator failures; a successful file-move script later stopped because an open file navigator correctly blocked a hunk click, then a separate hunk-restore trace completed that workflow; only explicitly named completed paths are credited.

This is agent evaluation and browser measurement. It is not human participant research, physical-device testing, native Tauri acceptance or screen-reader speech testing. Most observations used 390×844, with desktop host checks at 1440×1000. Scale fixtures and broader quality checks are F's separate evidence.

Frozen measures: a transition changes navigation depth or presentation container; unnecessary input adds no user decision and is avoidable in a working alternative; context loss records identity, selection, graph/file position, drafts and focus separately. Unsafe actions and accessibility blockers cannot be averaged into a favorable score. Pass means the stated observed path passed; Unverified means it was not established here.

## Executed paths

| Path | Independent observation | Status |
| --- | --- | --- |
| Mobile browse/preview depth | Select `wnpusytq`; collapse; expand; open d.txt; browser Back; Full | Pass for this fixture |
| Mobile tool return | Full → Commands → Current operation → Back | Pass after background fix |
| Desktop bounded tools | Open Current operation alongside graph; change graph selection to `yupnommu`; tab from tool selector to close control | Pass for one tool |
| Touch revision Move | Discover picker, cancel, reopen, choose unrelated revision, inspect both identities/consequences, perform typed MOVE, Undo | Pass after context/feedback fixes |
| Hunk selection/action discovery | Expand Hunk actions, select hunk, open palette; hunk actions appear without right-click | Pass |
| Hunk move | Choose destination, review, select Move, execute; Undo restores original commits | Pass repository recovery; initial touch recovery was blocked and later navigation fix retested |
| File move | Review/cancel leaves source and target unchanged; actual Move/Undo restores both original commit IDs | Pass repository state; file reading context limitation below |
| File restore | Select d.txt normally, palette Restore file from parent removes its addition; Undo restores original revision | Pass |
| Hunk restore | Restore hunk from parent, then Undo; original revision IDs restored | Pass recovery; result wording issue below |
| Bookmark | Create dialog Cancel; reopen; create `evaluation-temp`; Undo removes it | Pass |
| Full keyboard-only workflow and split resizing | Some keyboard shortcuts/focus transitions used; full scenario not executed | Unverified |
| Native, physical touch, OS keyboard, screen-reader speech | Not exercised by E | Unverified |

### Navigation and context measurements

Selecting, collapsing and expanding kept history length 2. File inspection added a precise commit/file route and history length became 3. Browser Back returned to the same selected graph revision and focused graph option. Full then reused the deliberate forward destination. Current operation added one view entry; Back returned to the original Full commit/file route and focused its Commands trigger. This sequence had eight inputs through tool entry (select, collapse, expand, file, browser Back, Full, Commands, Current operation) followed by one tool Back. Commands itself is a transient container; it did not create an additional route.

During the corrected operation-tool check, the accessible Commands button count changed from one in Full to zero while the tool was foregrounded, then one after Back. The tool heading received focus. No root horizontal overflow was measured in these mobile states. This does not establish internal clipping, 320 reflow or keyboard occlusion.

The desktop host kept graph, revision and Current operation visible together. Selecting `yupnommu` updated the revision while the repository tool remained open. The host used a Current operation selector button; no second production tool was available to establish multiple-tab switching. Adding a registered test view, layout reload and cross-breakpoint restoration remain separate acceptance evidence.

### Actual repository results

Revision Move changed `wnpusytq` from original commit `02584342`/parent `f86298e8` to a rewritten commit parented by `9ea5c1cb` (`yupnommu`). Undo restored the original commit and parent. The corrected Full test retained `wnpusytq` and d.txt throughout; its precise inspect URL followed the rewrite then returned to original `02584342` on Undo.

Hunk Move from d.txt to the unrelated revision completed and exposed a conflict. The review warned that conflicts may result; completion did not pretend the resulting content was conflict-free. The first immediate touch Undo attempt was blocked by feedback over Commands. A fresh-page palette Undo recovered the repository. Read-only backend checks confirmed original `wnpusytq=02584342` and `yupnommu=9ea5c1cb` afterward.

File Restore removed d.txt from the source's changed files; Undo restored the original source ID. Bookmark creation produced `evaluation-temp` at the chosen revision; backend bookmark listing after Undo reported no matching bookmark. No authenticated remote or external tool was invoked.

## Defects and corrections actually reviewed

| Initial finding | Correction retest | Current assessment |
| --- | --- | --- |
| Undo reset acted-on inspector to working copy, losing revision context | Full Move/Undo now retains logical revision and d.txt, including exact rewritten/restored route | Resolved on this path |
| Success feedback covered title/Commands and intercepted mobile touch Undo for more than four seconds | Feedback now sits at bottom; actual Full Commands click and Undo succeeded while feedback was present | Resolved on retested Full path |
| Underlying Full Commands remained exposed while Current operation covered it | Commands role count is zero in tool and one after Back | Resolved in observed role query |
| Desktop had no visible Commands launcher | Rendered desktop now exposes Commands; keyboard shortcut also works | Resolved |
| Hunk review omitted source revision identity | Later review names source description/change/commit/bookmark and destination | Resolved in rendered review |
| Redundant Changes/file-count heading consumed mobile reading height | Latest Full screenshot omits it while Files count remains | Observed improvement, not a timing claim |

Initial residual findings, subsequently corrected and retested in the final spot pass below:

- **Initial Action select accessible name:** the confirmation's native select exposed `id="field-Action" aria-label="Saved revset"`, while the visible label says Action. `getByLabel('Action:')` did not identify it. This is an incorrect accessible name observed in DOM; actual screen-reader speech remains untested. F should verify the reusable select's label propagation and duplicate-ID handling.
- **Initial file reading context after Undo:** File Move removed active d.txt and appropriately dropped its invalid file parameter. Undo restored original source/target IDs, but the route remained without `file=d.txt`, so original file reading context did not return. This is a context recovery limitation, not an unsafe repository result.
- **Initial hunk result wording:** Restore hunk from parent completed with a `Copy hunk — complete` message. The result should use the Restore intent rather than a backend implementation term.

The file Move Cancel check preserved both original commit IDs. Executing File Move rewrote both source and destination; Undo restored `wnpusytq=02584342` and `yupnommu=9ea5c1cb`. Hunk Restore followed by Undo also ended on those original IDs. All E mutations are recovered; operation history contains the evaluation/recovery operations, as expected.

Several failures were harness mismatches, not product defects: graph rows use role option rather than button; graph accessible names gained IDs during the review; the tool Back control is named Back from repository tool; file choice is named Choose changed file; Hunk actions is a details summary; the tool selector uses button rather than tab. These were corrected before crediting outcomes.

## Remaining acceptance

This independent pass supports the chosen graph-first/adaptive-host architecture and verifies real reversible workflows beyond the prior prototype. It does not close the nine-scenario ledger. E did not independently establish 100-revision delayed responses, 30/270-file reading, every merge/insertion topology, Restore into another revision, authoritative Redo after every mutation, remote/workspace operations, missing/ambiguous identity recovery, true zoom, complete keyboard paths or native/device accessibility. Require their linked evidence and final source checks before claiming complete production acceptance.

## Extended rendered matrix and infrastructure probe

E subsequently ran Graph → selected revision/Half → Full → Files at 320, 360, 390, 430, 768, 1024, 1440 and 1920 CSS-pixel widths, plus 844×390 landscape. Heights were 844 for narrow portraits, 1024 at width 768, 900 at 1024, 1000 at 1440 and 1080 at 1920. Light captures are in `evaluator/matrix/`; actual dark captures are in `matrix-dark/`, with a completed 768 retry in `matrix-dark-retry/`.

The fixture backend explicitly forces light theme. The initial dark-media run therefore still rendered light and is **not** dark evidence. The corrected dark harness changed only the `query_workspace` response's presentation `theme_override` to dark, retained all real domain data, and checked the actual `#shell` dark class in each state. This is an explicit presentation-fixture override, not a test of changing theme configuration. One 768 dark screenshot timed out waiting for fonts; its separate retry completed. The completed nine light plus nine actual dark runs each recorded all four states, with desktop resizing additionally captured.

No completed matrix state had document horizontal overflow. File controls and content remained inside their intended workspace in the representative images E opened: 360 Half, 844 landscape Half/Full, 320 Full, 390 dark Full, 768 dark Files overlay, 1024 resized Full and 1920 dark resized Full. At1024/1440/1920, actual Files divider dragging changed its value from 200 to 294px; keyboard ArrowLeft then changed it to 318px in both themes. The rendered diff region retained space alongside the resized Files panel.

Internal control checks found a defect that root overflow did not reveal: at 320, wrapping put the compact Diff display options anchor on the left, but its right-aligned popup extended fromx=-148 to 52. Most controls were clipped offscreen. After the director introduced viewport-clamped placement, E reopened it at 320 and 360: its bounds were x=12..212; actual Diff layout→Unified selection and Wrap lines checkbox worked; Escape closed the menu. Evidence: `matrix/light-320-open-diff-options.png` before, `matrix/retest-320-options.png` and `retest-options.json` after. At844 the interface uses inline layout controls rather than the compact popup.

A real wheel containment probe in short landscape moved preview scrollTop 0→240 while graph remained 0. A subsequent wheel over the graph moved graph 0→350 while preview remained 240; Half stayed open. This establishes independent Half/graph scrolling on that fixture. A separate long-diff Full probe did not complete during backend/identity integration; no Full long-diff containment pass is claimed from it. Out-of-bounds DOM rectangles also include deliberately scrollable graph rows/bookmarks and descendants of closed details; those are not automatically counted as defects.

Platform availability was probed rather than inferred:

- Linux `DISPLAY=:0` exists and `target/debug/gg` links GTK3 and WebKitGTK2.54.1. Linux native runtime infrastructure is therefore available in principle. E did not launch/control a native GG window or test native menus/external programs; native acceptance remains open.
- Stock Firefox158 is installed, but Playwright's launch exited before its Juggler connection. Only Chromium Playwright engine binaries are cached; no geckodriver or WebKitWebDriver command was available. A Firefox CLI screenshot launched successfully but captured Loading before async repository queries completed. It does not establish alternate-engine application correctness.
- No adb, xcrun or Orca command was found. E had no identified physical iOS/Android or screen-reader session to operate. Physical touch, software keyboard/safe-area and actual speech results remain Unverified. This is not a claim that no hardware could exist.

These captures were taken during integration. The final spot pass below supplies bounded correction evidence; authoritative package-wide release gates remain separate; the matrix does not imply full device, accessibility or performance acceptance.


## Final integration spot pass

The director declared production source ready at the start of E's bounded final pass. E recorded **2026-11-05 13:06:48–13:09:25 UTC**, active branch `gg-full-scope-plan`, and starting working-tree snapshot `116064d737e8c97a3d06686ac6ac99cbeafa69f5`. This identifies the observed integration window; it is not a release commit claim. A final wide-Full tool-space correction was applied and retested during that window. E did not repeat the broad matrix or change production code.

Evidence: `.taste-skill/studio/full-pass/evaluator/frozen/observations.json`, `final-spot.zip`, `reserved-tool.json`/`reserved-tool.zip`, screenshots, and `backend-final.txt`.

- **390 Half → Full d.txt → Current operation → 1024 → 390 → Back: Pass.** Exact revision/file/tool route survived presentation changes. Mobile tool foreground exposed zero background Commands controls; Back restored Full with its original file route.
- **Wide Full and tool composition: Pass after final correction.** At width 1024, Full measured 704px and the tool320px. Commands moved to x=608, before the tool's x=704 boundary; its real pointer click opened the palette. Closing the tool restored Full to 1024px and removed only the view parameter. Returning to 390 retained the same commit and d.txt. E opened the rendered corrected screenshot to verify the reserved region rather than relying on bounds alone.
- **Action name and file Move → Undo: Pass.** The actual native select now has `aria-label="Action"`; the role/name locator selected Move successfully. Undo restored `?inspect=025843422c8f5374a4160fe79195b92d6ec3c6ee&file=d.txt`, fixing the prior active-file recovery limitation. The final settled backend check confirmed original `wnpusytq=02584342` and `yupnommu=9ea5c1cb`. Earlier event-time backend samples in the JSON can precede asynchronous operation settlement; `backend-final.txt` is the settled recovery check.
- **Restore hunk result wording: Pass.** Another actual Restore hunk from parent → Undo displayed `Restore hunk — complete` and recovered the fixture; it no longer reports Copy hunk.
- **320 Diff options: Pass.** Popup bounds x=8..208 fit the viewport. Unified layout and Wrap lines accepted real input, then Escape dismissed the menu. E inspected the open popup screenshot.
- **1440 Files splitter: Pass.** Actual pointer resize changed 200→284px, then keyboard ArrowLeft changed 284→308px. Selected d.txt remained visible; E inspected the resulting Full/Files screenshot.

All E mutations are recovered and no known blocker remains in these retested paths. The broader Unverified scenarios and native/device/assistive-technology limits elsewhere in this report remain open; this bounded pass does not replace their evidence.
