# Full-scope delivery plan

2026-11-05. Status: central implementation delivered and integrated web/backend acceptance exercised. Platform release gates remain open; the targeted typography/accessibility review is complete, with its platform limits recorded. This is not a blanket production-readiness claim.

The previous delivery was a working graph-first inspector foundation, not completion of the full production design brief. The 72-test result is historical regression evidence for commit `9437473`; it does not establish complete scenario coverage, command parity, workspace extensibility, accessibility conformance or production readiness. This plan supersedes broad completion claims while preserving valid implementation and evidence.

## Scope and decision authority

The original 18-section brief remains the scope. The later mobile inspector specification is binding: Collapsed/Half share a contextual sheet, Full is a routed revision destination, graph selection is separate from presentation, and gestures start on a dedicated handle. Later refinements require a motion specialist, compact aligned graph rows with author available in details, and a desktop Files drag splitter. Existing useful jj operations must remain accessible, including without drag.

The plan covers implementation, research, alternatives, independent evaluation, visual refinement and verification. A document or metadata-only registry does not fulfill a working interaction requirement. Conversely, the research examples do not mandate building every future feature. A full operation log, evolution browser, embedded resolver, arbitrary docking and every diff mode are not automatic additions to this iteration.

No percentage-complete estimate is assigned: requirements vary materially in size and several have not received acceptance evidence. Status below distinguishes implemented evidence from partial delivery, absent capability and unverified quality.

## Current delivery and acceptance status

The original package descriptions and baseline findings below are retained as scope and provenance, not a current list of missing features. The selected adaptive workspace, durable command context, non-drag workflows, staged loading, exact identity/recovery, reader, feedback and shared visual controls are implemented. The current recorded suites pass **131 frontend/browser tests and 210 Rust tests**; test counts support regression confidence rather than substituting for task evidence. [Validation](validation.md) owns final build/lint/format results and the fresh typography/accessibility audit; [independent evaluation](full-evaluation.md) records actual browser attempts and correction retests.

| Package | Current disposition | Closure evidence / remaining boundary |
| --- | --- | --- |
| W01 | Capability/research reconciliation delivered | [Capability ledger](capability-ledger.md), [research](research.md); baseline gaps remain historical below. |
| W02–03 | Closed for architecture selection | [Versioned alternatives](mobile-comparison.md), [independent comparison](composition-evaluation.md): real modal, adaptive host and task-stack alternatives; sibling-history failure fixed/retested before choosing B. |
| W04–05 | Implementation and automated/web acceptance delivered | [Workspace contracts](workspace-architecture.md), [validation](validation.md), [final independent rotation/identity/Undo checks](full-evaluation.md#final-integration-spot-pass). Native/device parity belongs to W16. |
| W06 | Inspector contract implemented and browser-tested | [Validation](validation.md): handle-only movement/cancel, 72px collapse, Half/Full/Back and stale-safe selection; physical keyboard/safe-area behavior unverified. |
| W07–09 | Command parity and recovery implementation delivered | [Capability ledger](capability-ledger.md), [validation](validation.md), [independent mutations/recovery](full-evaluation.md). Local bare remotes and external diff launch tested; exhaustive remote/topology and external merge execution not claimed. |
| W10–11 | Reader and staged loading delivered | [Loading measurements](loading-performance.md), [validation](validation.md): 30/270 files, precise paths, summary/active diff, bounded navigator and stale rejection. Large single-file rendering remains a measured limitation. |
| W12 | Interaction lifecycle implemented and corrected | [Motion review](interaction-motion.md), [independent feedback/gesture/scroll checks](full-evaluation.md). No device feel or FPS claim. |
| W13 | Design-system rollout implemented | [Design system](design-system.md), [validation](validation.md), rendered light/dark matrix. [Fresh typography/accessibility audit](accessibility-typography-audit.md) completed; it is not a conformance certification. |
| W14 | Current automated suites passed; manual accessibility gates open | [Validation](validation.md): 131 frontend/browser and 210 Rust checks. [Fresh F audit](accessibility-typography-audit.md) observed actual Chrome zoom and default-font enlargement. Physical keyboard and screen-reader speech remain unverified. |
| W15 | Independent browser evaluation and significant fix/retest pass delivered | [Full evaluation](full-evaluation.md), including final integration spot pass. Agent judgment and browser measurements are distinguished from human research. |
| W16 | Open platform release gate | [Native validation](native-validation.md): X11 rendering/menu/command path observed; default Wayland negative viewport/DPR remains a failure. macOS/Windows, physical mobile and actual assistive-technology acceptance remain unverified. |

Full operation history, evolution browsing, arbitrary docking, continuous all-files mode and an embedded resolver remain deliberate future scope. Their absence does not reopen central implementation. Unavailable or incomplete platform validation is an open gate, not a feature deferral or a passing test.

## Historical baseline coverage against the original brief

This table records the audit that opened the work. Its outstanding-obligation column is historical; current disposition is above.

| Brief | Baseline evidence | Baseline obligation | Packages |
| --- | --- | --- | --- |
| 1. Product discovery and original GG/jj research | Source inventory and referenced research exist | Audit completeness of capabilities, shortcuts and issues/PR/discussion provenance; relate each finding to an implemented decision or explicit future candidate | W01, W07 |
| 2. Design studio | Seven roles participated; now reactivated | Explicit ownership, genuinely independent acceptance and no creator-only approval | All; W03, W14–16 |
| 3. Core UX principles | Graph remains mounted; basic progressive disclosure | Prove all existing operations are discoverable, safe and available across input methods | W04–09 |
| 4. Navigation and panel system | Fixed graph/revision/files, local preferences, modal tool host | Registry-driven destinations and constrained desktop split/tab composition, clear lifecycle/history/restore | W04–05 |
| 5. Mobile contextual inspector | Closed/collapsed/half/full; graph continuity and route tests | Strict handle ownership, continuous gesture feedback, cancellation, lifecycle and ambiguous/missing selection recovery | W05–06, W12 |
| 6. Excellent full revision view | Focused reader, Files/Details, search, scroll memory, metadata | Complete complex-file fidelity, explicit missing-file recovery, related navigation, reading-state identity, scale and loading | W05, W10–11 |
| 7. Global commands | Repository/revision registry and palette | Durable file/hunk/ref/workspace context and complete shared capability/dispatch coverage; all drag alternatives | W07–09 |
| 8. Extensible workspace | Definitions exist; tools render in one modal | Enforce declared presentation, state/commands/context/route contracts; demonstrate new view without shell-specific branches | W04 |
| 9. Unified design language | Incumbent tokens, shared controls, compact graph | Complete component/state rollout and non-color semantic statuses; measured visual/a11y review | W12–14 |
| 10. Specialist skills | Actual sources read and archived | Apply their audit/refinement methods to the remaining work; maintain evidence and explain deliberate adaptations | W01–03, W12–16 |
| 11. Competing prototypes | Three interactive content-priority variants | Two additional structurally distinct compositions against working baseline; shared fixtures and task comparison | W02–03 |
| 12. Independent evaluation | Agent judgments and actual Chrome paths | Complete all nine original scenarios with consistent before/after metrics; fix/retest significant failures | W03, W14–16 |
| 13. Implementation | Significant frontend change shipped | Complete remaining architecture, behavior, backend contracts where needed and obsolete-control removal | W04–13 |
| 14. Rendered validation | Width/theme matrix, several isolated operations | Internal clipping/scroll/focus/state coverage, browser engine/native parity, true zoom, hardware limits | W14–16 |
| 15. Measurable acceptance | Many useful unit/component/E2E checks | Requirement-to-test/evidence ledger; zero unresolved critical core failures; no green gate from test count alone | W14–16 |
| 16. Deliverables | All requested document categories exist | Reconcile stale claims; version reproducible fixtures/prototype harnesses; explain final implemented decisions | W01–16 |
| 17–18. Full execution and quality | One iteration delivered | Reopen divergence through refinement; director accepts complete user outcomes rather than files or phases | W02–16 |

## Historical findings that changed the plan

These findings describe the pre-implementation baseline. Their corrections and retests are linked in the current acceptance tables; they must not be read as present defects.

These are source/document audit findings, not new browser measurements:

- `workspace/views.ts` declares modes, but `WorkspaceTools.svelte` special-cases History/Changes and places other views in a modal. Registration does not yet supply real composition or navigation policy.
- `commands/registry.ts` does not cover all existing bookmark/workspace commands or the insert/merge-parent/file/hunk/ref operations in `BinaryMutator.ts`. Context menus still have separate availability checks. Palette context relies partly on transient right-click state.
- Undo's current label derives from status description. Backend snapshotting and eligibility rules mean that label is not an authoritative preview of the next undo operation.
- Rewrite reconciliation finds a unique logical change in the loaded graph. A filtered graph does not establish repository-wide uniqueness. Missing and ambiguous identities lack distinct resolution paths.
- File reading keys use logical change identity. Divergent versions and ranges need an explicit sharing policy. A missing requested file can silently fall back to another file.
- The sheet snaps after release but does not track the finger. The collapsed summary itself owns drag events, exceeding the strict handle-only specification.
- Existing prototypes share a navigation/history skeleton. Their scorecard cannot establish that competing navigation architectures were compared.
- A virtual file list bounds mounted rows, but the backend still returns complete diff data. A 500-line scrolling test does not establish loading scalability or measured performance.
- The visual foundation exists; status combinations and async states are not consistently implemented across all surfaces. Several documentation recommendations still describe work as if it were implemented, or describe already-fixed defects as current.
- Singleton self-destination handling in `BinaryMutator.canDrop` is a suspected identity-validation gap to reproduce, not a confirmed successful invalid mutation.

## Studio and execution rules

| Role | Model | Ownership | Independent reviewer |
| --- | --- | --- | --- |
| A — Mobile interaction | Sol 6.1 | Competing mobile navigation and final preview/reader interaction design | E, F |
| B — Workspace architect | Terra 6.1 | View host, navigation, persistence, inspector identity contracts and desktop composition | D, F |
| C — Visual system | Sol 6.1 | Semantic tokens, shared primitives, status/density rollout | E, F |
| D — jj workflows | Terra 6.1 | Command semantics, capability inventory, backend identity/recovery contracts | B, F |
| E — Adversarial evaluator | Sol 6.1 | Blind task attempts, baseline/concept/implementation scorecards; no production feature authorship | Director |
| F — Accessibility/quality | Terra 6.1 | Fixtures, automated contracts, keyboard/focus/zoom, platform matrix | E, Director |
| G — Interaction/motion | Sol 6.1 | Handle interaction, pending/drop/result lifecycle, secondary-header experiment | A, F |
| Astra — Director | Root | Choices, integration, source boundaries, rendered acceptance and scope ledger | All specialists challenge |

Seven roles are active responsibilities, not seven simultaneous workers. The harness allows the director plus three active specialists. Run waves; idle specialists receive bounded follow-ups. All seven supplied read-only gap reviews for this plan. E supplies the independent acceptance audit after the design audits.

Production code ownership is leased per package: B owns workspace/state/views/host/App; D owns registry/mutators and backend contracts; C owns global/shared styling; G owns sheet gesture and operation feedback only after B/D contracts stabilize; F owns acceptance tests. A supplies design/prototype work then takes reader files by explicit handoff. Root integrates Shell/stores/IPC changes. No two agents edit a shared file concurrently. Use ignored isolated prototypes or dedicated worktrees for competing concepts; final changes belong to the active named task branch. Preserve pre-existing changes separately.

## Original ordered work packages

The original implementation instructions and acceptance contracts are retained below. Current package disposition is recorded above; future-tense wording here does not mean those features are still absent.

Each package needs code or a deliberate, evidence-backed decision, an independent review and a linked acceptance result. Estimates are planning sizes, not delivery promises: S is bounded, M spans several components, L crosses architecture/backend or multiple scenarios.

### W01 — Reconstruct the capability and evidence ledger (D + F, M)

Inventory every current command, shortcut, gesture, surface, native/web constraint and backend operation. Map every original requirement to source, test and observed artifact, with implemented/partial/missing/unverified status. Refresh research only where missing or unreliable: concrete upstream PR/issue/discussion links, jj version applicability, existing/requested/speculative/unsuitable classifications. Reconcile conflicting older specs and historical evidence without erasing it.

Accept when each operation has a discoverable input path and planned parity owner; each requirement has an acceptance owner; prototype observations cannot be mistaken for final implementation evidence. No production rewrite dependency. Pin comparison baseline to `9437473`, with named fixture and runtime; the preserved scrollbar snapshot `bfcf16c` is separate and must not silently become baseline evidence or a new improvement.

### W02 — Genuine alternative compositions (A + B, M; after W01)

Retain current graph/sheet as Concept A baseline. Prototype B as an adaptive inspector workspace: selected repository tools occupy one bounded tab/split host on desktop and explicit destinations on compact screens. Prototype C as a minimal launcher with a navigable review stack and contextual task surfaces. All keep the binding half/collapsed/full contract; differences must include tool discovery, destination state and restoration, not just content order. Use real snapshot/fixture content and working selection, Full/Back, file choice, tool switching and action discovery. Do not implement three production systems.

Accept runnable, versioned harness and comparable 390/768/1440 screenshots; designers state the tradeoff each concept tests before seeing evaluator results.

### W03 — Blind comparative evaluation and architecture decision (E + director, M; after W02)

Evaluate novice jj/mobile triage, experienced jj/keyboard, large-change reviewer and keyboard-only personas. Measure actual completed tasks, transitions, input counts, lost context and failures against identical fixtures. Scores are agent judgments, never human participant rates. Prototype mutation tasks measure discovery and source/target understanding only. Actual mutation correctness and recovery require an isolated backend in the implementation evaluation; mocks cannot establish safety. Compare baseline and all alternatives, fix the strongest failures, and rerun before choosing. Director records rejected alternatives and one coherent interaction contract.

Accept a justified decision that improves task outcomes without regressing graph access or adding persistent mobile clutter. No new navigation implementation before this gate.

### W04 — Working workspace/view composition (B, L; after W03)

Make view declarations drive hosting, context, availability, commands, supported presentation, state restoration and navigation. Separate domain/selection/navigation/presentation/persistence owners. Use the smallest constrained secondary host justified by W03: desktop split or bounded tabs; mobile routed destination or transient task as appropriate. Preserve graph primacy. Define tab limits, replacement/close/restore and active identity. Add versioned validated layout persistence and reset-to-default. Migrate existing separate pane adapters; remove obsolete duplicated navigation.

Register a real Current operation view using the same host, including state, unavailable state, Back and restoration. A full oplog is not required. Accept adding a test view through its component and definition with no new shell `if` branches. Exercise its declared desktop and mobile presentations, active indication, keyboard close/restore and switching while graph selection, range and scroll survive. A generic modal and descriptive placement metadata do not pass.

### W05 — Repository/selection/history lifecycle correctness (B + D, L; after W04 contract)

Specify and implement exact commit/range identity plus logical change continuity. Resolve rewrite ambiguity against authoritative repository data rather than visible graph rows. Distinguish missing, hidden, ambiguous and unavailable selection; offer explicit recovery/choice. Define selected-file validity and deliberate missing-file UX. Scope reading state so divergent commits do not accidentally share it. Use a stable repository identity rather than path alone, and distinguish a valid selection excluded by the active revset from a repository-wide missing revision. Cover repo switch, same path/different repo, filtered graph, refresh, Back/Forward, close/reopen, rotation and restored layout. Temporary presentation must never trigger mutation.

Accept real-backend divergent, rewritten, abandoned and filtered-selection tests; no silent jump to unrelated revision/file. Full pushes one entry; graph taps none; file changes replace; Back returns correct sheet/anchor/focus. Preserve valid path across compatible selections and reset only invalid state.

### W06 — Finish mobile preview and interaction depth (A + G, M; after W03/05)

Use one revision context across preview and Full without duplicate fetches. Separate tap summary from dedicated drag handle in collapsed and half states. Track handle movement within bounds, settle interruptibly, and handle cancel/multi-pointer/rotation/navigation during drag. Keep graph and content scrolling independent. Make description/metadata/status/counts/file preview useful at small portrait and short landscape heights. Provide explicit close/deselect/restore behavior with clear selection semantics and no extra bottom navigation.

Accept closed/null, 64–80px collapsed summary, approximately half-height preview, full action/file tap, prior-state return, latest-selection-only data, no hidden focusable content and no accidental scrolling gesture mutation. Real keyboard/safe-area evidence remains a separate gate.

### W07 — One complete command model (D, L; after W01, coordinated with W04/05)

Use durable typed operands for repository, revisions/ranges, file, hunk, bookmark and workspace. Stable IDs, context, labels/icons/shortcuts, availability reasons and execution must be shared by palette, context menus, toolbars, keyboard and native adapters. Recheck repository, identity, immutability and busy state after asynchronous input. Distinguish inspection from working-copy Edit and rewriting commands. Make ordinary selection expose its commands without first right-clicking.

Accept parity inventory with no orphan existing operation, identical eligibility across surfaces, stale-prompt and repository-switch protection, and editable-field shortcut safety. Backend guards remain authoritative.

### W08 — Accessible direct-manipulation alternatives (D + A, L; after W07)

Provide discoverable source/action/destination flows for existing revision rebase/insertion, merge-parent add/remove, file/hunk move/copy, and bookmark movement. Use a visual searchable destination picker plus expert revset entry where useful. State exact identities, scope and consequences; confirm according to risk instead of indiscriminate typed confirmation. Preserve native drag behavior. Reproduce and guard same-source/destination and stale-target cases.

Accept mouse, keyboard and touch-command parity; valid/invalid/conditional destinations explained; Cancel/no-op has no repository effect; correct descendants/parents/path/hunk result verified and Undo restores the fixture.

### W09 — Truthful recovery, remotes and workspace operations (D, L; after W07)

Expose authoritative Undo/Redo target and eligibility where needed through a backend contract; explain repository-wide operation scope and snapshot/precondition limits. Handle initialization, merge-operation and other-workspace restrictions without misleading preview. Preserve per-bookmark/all/tracked/remote push/fetch distinctions, rename/delete/track/untrack, workspace open/rename/forget, file history and external diff/resolve availability. Errors and credentials remain contextual.

Accept description/edit/move/partial-operation recovery and Redo with backend-state assertions; local bare-remote tests for scopes and failure paths; configured external/native capability checks. Never exercise authenticated production remotes merely to validate UI. Full historical selective restoration is a future feature.

### W10 — Full revision reader completeness (A + B, L; after W05/07)

Complete responsive description, distinct IDs, author/time, parents/related navigation, bookmarks/statuses, file metadata and actions. Keep focused file reading as baseline; compare continuous reading only if tasks justify it. Preserve stable selected path plus vertical/horizontal positions across reasonable transitions. Make long/deep names, hundreds of files, binary/deleted/renamed files, conflicts and empty/error states legible. Search/previous/next and sticky identity must work without constant context loss. Verify text selection/copy and complete diff semantics.

Accept file 20 of 30 and deep search in 270 files, return to prior reading position, exact missing-file handling, full metadata access and reliable description Save/Cancel with keyboard visible. Desktop Files drag resizing, keyboard resize, clamping and persisted preference remain regression gates.

### W11 — Summary-first data and measured diff scalability (D + B + F, L; after W05/10 contract)

Measure current summary latency, active-file latency, payload, mounted DOM and long-task/render cost on reproducible workloads. Implement the binding summary/file-list-first and stale-safe active-diff loading contract. Measurements determine batching, cache policy, optional prefetch and rendering optimizations; they do not waive staged loading. Cache by precise repository/commit/range/file/options and reject obsolete responses. Preserve native/web query parity. Add lazy hunk rendering or virtualization only when justified, preserving selection/copy/find/accessibility semantics. Bound caches and avoid re-rendering the graph for sheet-only changes.

Accept published environment/workload/before-after measurements and no material baseline regression. Set numeric budgets from the baseline before optimization; no invented FPS claims. Tests assert obsolete diff cannot replace current selection and inactive files are not needlessly fetched after staged loading is introduced.

### W12 — Operation feedback, motion and mobile chrome (G + C, M; after W06–08 contracts)

Implement source→destination→pending→confirmed/error drop lifecycle, cleanup on blur/Escape/drop outside/unmount/failure, and one accessible result announcement. Align query loading/stale/retry and mutation progress/cancel/success/error. Keep pending identity truthful and context visible where safe; no success cue before backend confirmation or flash of generic modal for fast work. Distinguish canceled input from authentication/error text.

Compare fixed compact chrome against retreating secondary description/options chrome in mobile Full only. Keep Back, active file and actions visible; use diff-local scroll hysteresis, no layout/scroll jump, reveal/freeze for keyboard focus/menu/edit/drag. Ship auto-retreat only if measured usable reading space improves without reachability/discoverability failures; otherwise ship explicit compact mode and document the decision. Primary graph navigation never hides from unrelated scrolling.

Accept interruptible gestures/transitions with reduced-motion parity; no graph-row entrance animations; no scroll remount/jump; no hidden reachable control; operation status and cleanup verified under delayed/failing responses. Existing CSS/Pointer Events/Svelte are preferred; no new library without demonstrated capability need and compatibility review.

### W13 — Complete design-system rollout (C, M; after W03; integrate after host contracts)

Keep Plex typography, quiet surfaces and graph semantics. Define semantic status combinations for working copy, immutable, conflict, divergence and bookmark lifecycle; convey meaning without color or hover alone. Audit/migrate shared buttons/toggles/selects/chips/menus/dialogs/splitters and all hover/focus/selected/disabled/busy/error states. Reconcile typography, spacing, density and overlay elevation. Maintain aligned compact graph rows with author in details; configurable columns are an evaluated optional enhancement, not a reason to restore the author line.

Accept rendered state matrix, measured text/status/focus/control contrast, target geometry and text reflow in both themes; selected/conflict/divergent/drop/focus must remain distinguishable. No cosmetic library migration.

### W14 — Automated acceptance and accessibility (F, L; fixtures begin after W01, final after W04–13)

Version reusable isolated fixtures for 100+ revisions, 30/270 files, deep paths, long diffs, binary/delete/rename, divergent same-change commits, multi-parent/range, immutable/conflict and missing/error states. Run the full scenario matrix below with backend assertions. Add keyboard-only traversal, accessible name/role/state, focus visibility/restoration, Escape priority, true zoom/reflow, forced colors and reduced motion. Browser engine and unsupported environment constraints are explicit. Capture internal clipping and actual reachability, not just root scrollWidth.

Accept no critical task/safety/accessibility blockers, every mandatory scenario with current evidence, meaningful unit/component/backend/E2E checks, typecheck/build/fmt/Clippy and relevant cargo tests. Run cargo gen whenever message structs change. Test numbers alone never close this package.

### W15 — Independent rendered evaluation and refinement (E + director, L; after integrated W04–14)

Repeat the same persona tasks against baseline and integrated implementation. Inspect 360/390/430/768/1024/1440/wide, 320 reflow, breakpoint edges, portrait/landscape, both themes and complex states. Record task completion, transitions, taps/keystrokes, confusing or unavailable commands, lost reading context, unsafe actions and focus blockers. Fix significant findings and rerun the failed path plus adjacent regressions. Include expert desktop direct manipulation and compact graph scanning.

Accept screenshot/trace evidence for the final commit and an independent scorecard with reasons. Do not imply real human testing or attach timings to tasks without measuring them.

### W16 — Cross-platform acceptance and honest handoff (F + director, M; after W15)

Exercise actual available Tauri runtime/native menus/external-tool paths and web transport. Check physical iOS/Android gesture feel, software keyboard, safe areas and screen-reader speech when hardware/session access exists. Probe availability first; missing infrastructure is recorded as an open release gate, not a successful test or a reason to omit automatable checks. Measure representative hardware performance only if hardware exists.

Reconcile all eight deliverable categories, reproducible evidence and remaining limits. Final acceptance requires current source checks and clean intended branch. No claim of complete production/device/a11y acceptance while its gate remains unverified. Push/upstream only according to user authorization; disclose absent upstream.

## Nine-scenario acceptance ledger

| Scenario | Current acceptance and evidence | Remaining boundary / owner |
| --- | --- | --- |
| 1. Mobile browse | **Pass, automated web:** 105 added revisions, delayed selection/latest response, collapse/reopen, graph scroll/focus continuity. [Validation](validation.md), [independent wheel/preview checks](full-evaluation.md). | Physical touch feel and native parity Unverified; A/F. |
| 2. Deep inspection | **Pass, automated web:** file 20 of 30, 270-file navigator, precise route/Back/Forward and reading restoration. [Validation](validation.md), [loading](loading-performance.md). | Complete large individual-file rendering remains a measured limitation; A/F. |
| 3. Description | **Pass, browser/backend fixtures:** exact Save/Cancel/Undo; draft survives resize/remount and verified rewrite. [Validation](validation.md). | Actual OS keyboard occlusion Unverified; A/D/F. |
| 4. Graph manipulation | **Pass for replayed/automated paths:** revision, file/hunk and bookmark movement, explicit destination/review, cancel and repository recovery; insertion/merge commands share guards. [Capability ledger](capability-ledger.md), [independent evaluation](full-evaluation.md), [validation](validation.md). | Every operation/topology/input-platform combination was not replayed independently; native/device parity Unverified; D/G/F. |
| 5. Undo/recovery | **Pass, isolated backend/web:** preflight restrictions, Undo/Redo assertions, exact revision/file recovery, local-remote/workspace scopes and external diff launch. [Validation](validation.md), [capability ledger](capability-ledger.md). | External merge-tool execution and authenticated remote paths Unverified; D/F. |
| 6. Extension | **Pass, registry/component/web evidence:** real Current operation and registered test view, host/route/close/restore/rotation without a feature-specific shell branch. [Workspace architecture](workspace-architecture.md), [validation](validation.md), [independent spot pass](full-evaluation.md#final-integration-spot-pass). | Full future oplog and arbitrary docking are deliberate future scope; B/E/F. |
| 7. Power user | **Pass for automated/browser keyboard paths:** graph navigation, palette, menu keys, graph/Files resizing and secondary-host continuity. [Validation](validation.md), [independent evaluation](full-evaluation.md). | Full native workflow across supported OSes Unverified; B/F. |
| 8. Complex states | **Pass for generated/real fixtures:** divergent exact identities, range/multi-parent/immutable/conflict, binary/delete, missing/loading/error recovery. [Validation](validation.md). | Arbitrary noncontiguous multi-select is not an existing feature; exhaustive topologies not claimed; D/F. |
| 9. Mobile edges | **Pass for automated viewport/theme/motion/focus checks:** 320–1920 widths, short landscape, long labels, interruption and handle ownership; clipped options corrected with real control retest. [Validation](validation.md), [independent matrix](full-evaluation.md#extended-rendered-matrix-and-infrastructure-probe). | **Observed:** actual Chrome 200%/400% zoom and 32px browser-default font, with enlargement defects corrected. **Unverified:** physical keyboard/safe areas and screen-reader speech. [Typography audit](accessibility-typography-audit.md); A/G/F. |

Measurement definitions frozen before W03: a transition changes navigation depth or presentation container; unnecessary input adds no user decision and is avoidable in a working alternative; lost context records identity, selection, graph/file position, draft and focus separately; unsafe action includes stale or inadequately identified target execution and ineffective cancellation. Mark each outcome **Pass / Fail / Unverified**. Never average a safety or accessibility blocker into a passing score. Scenario 4 also requires W08 file/hunk/bookmark parity, and scenario 5 includes W09 workspace/remote coverage. E independently attempts tasks and inspects failures rather than accepting F’s passing tests alone.

Every row records: source commit, fixture/version, runtime/input, exact steps, observed metrics, pass/fail, screenshots/trace, remaining limitation and next owner. Prior isolated probes may support a row; they do not replace its complete flow. Actual devices and assistive technology are identified separately from emulation.

## Sequencing and completion rules

Dashboard T04–T19 correspond to W01–W16. The dashboard supports one prerequisite per ticket; the full dependency lists here remain authoritative. Dashboard durations are initial planning estimates to revisit after W03, not delivery commitments.

1. W01 inventory/fixtures → W02 concepts → W03 independent selection. Preserve working baseline throughout.
2. Parallel lanes after selection: B W04–05; D W07; C W13; F fixtures when a slot is free. Director resolves shared contracts before file leases.
3. A W06/10, D W08–09, B/D W11; G W12 after operation and navigation lifecycle contracts exist.
4. F W14 + E W15, followed by a mandatory fix/retest pass. W16 closes platform evidence and deliverables.

Do not mark a phase complete because artifacts exist. Close a package only when its acceptance evidence is reviewed. Implementation may be complete while device verification remains open; report those separately. Reopen a completed package if integration breaks its contract. Avoid accumulating unchecked speculative abstractions or rebuilding the working sheet merely to increase change volume.

## Historical branch and pre-existing-work provenance

This paragraph records the planning-stage rescue, not final delivery status. At audit start the worktree contained uncommitted scrollbar/layout edits. They were preserved exactly in commit `bfcf16c` on `rescue/pre-scope-audit-20261105` before planning edits. The active task branch `gg-full-scope-plan` starts from that snapshot so those files remain present; `tricky-owl` remains at the prior delivery. Snapshot work is not claimed as part of this planning delivery and has not been newly validated. No push or upstream configuration was requested.
