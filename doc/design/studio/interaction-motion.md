# Interaction and motion review

GG is a working version-control interface. Motion should explain panel location, acknowledge an action, or distinguish pending work from completion. Reading a diff, selecting a revision, using a keyboard command, and scrolling the virtualized graph should remain immediate.

## Scope and evidence

This is a code-grounded review of the current integration, not a claim of human usability testing. Browser interaction checks will be recorded separately against the production fixture once integration is ready. Physical iOS/Android touch feel, browser chrome, software keyboards, and reduced-performance hardware remain untested.

Reviewed: `app/workspace/InspectorSheet.svelte`, `app/objects/Object.svelte`, `app/controls/BoundQuery.svelte`, `app/GraphLog.svelte`, `app/Shell.svelte`, `app/global.css`, `app/mutators/BinaryMutator.ts`, and `package.json`.

## Findings

| Before | After | Why |
| --- | --- | --- |
| Sheet has a mount-only `arrive` keyframe; collapsed/half state swaps height and contents instantly. | Keep the sheet surface at a stable expanded height, translate to the collapsed position, and use an interruptible transform transition for pointer/tap changes. | A panel should visibly occupy a different position without animating layout or shifting graph rows. |
| Mount animation can fire whenever a new preview is created. | Keep frequent revision selection immediate; animate occasional presentation changes only. | Selection is repeated many times per session. Motion must not delay scanning. |
| Sheet gesture tracks only start Y. | Track active pointer ID; clean up on pointercancel/lostpointercapture; suppress the click following a drag; use only the handle as gesture surface. | Secondary pointers and cancellation must not strand state or trigger an unintended collapse. |
| `Object.onDragStart` returns on forbidden operands without canceling the native event. | Call `preventDefault()` on rejection. | A forbidden operation should not start a native drag ghost. |
| Mutation wait can mount an empty blocking ModalOverlay when no progress event exists. | Keep the reading surface visible and make pending state explicit; reserve a progress dialog for sufficiently long work with real progress. | An unexplained blank layer interrupts direct manipulation and conceals the result. |
| `BoundQuery` keys the entire content by query object. | Do not attach entrance motion to this wrapper; assess remount/scroll persistence independently. | Fresh query objects should not cause repeated reveals or erase reading position. |

Verdict: **Block additional decorative motion.** Prioritize gesture correctness, a coherent sheet snap, and honest pending/error feedback. The existing global reduced-motion rule already disables transitions, animations, and smooth scrolling; retain it. The existing sheet has dedicated touch handling and pointer cancellation, which are useful foundations.

## Hide-on-scroll decision

A disappearing global header is not the default for this app. A graph, inspector, and diff are independently scrollable working surfaces, and users need stable navigation and object identity. Only a secondary repository toolbar may retreat in full-diff mode if measured screen-space benefit justifies it.

If implemented, keep Back, active file identity, and the action-menu trigger visible in a compact fixed row. Translate the secondary chrome without changing document flow or scrollTop; do not mount/unmount the diff. Reveal on upward intent with a threshold so small finger reversals do not flicker. Reveal and freeze while a menu, keyboard focus, or drag is active. The graph's scroll must never hide the diff's controls. Prefer a visible compact mode button if automatic behavior proves unpredictable.

## Motion contract

- Selection, graph virtualization, keyboard commands, command-palette toggles: immediate. Do not animate graph row positions or re-key virtualized rows by revision.
- Pointer/tap sheet snap: 220–240ms transform, existing `--motion-sheet-duration` and `--motion-sheet-ease`; drawer curve `cubic-bezier(.32,.72,0,1)`. Keep interruption smooth by transitioning the current value rather than restarting a keyframe.
- Sheet drag: direct tracking, no transition while pointer is active. A bounded snap implementation is acceptable and must not be described as momentum/physics. Do not introduce a spring library for two snap positions.
- Press: brief existing semantic background change; no bounce or scale on dense graph rows. Touch gets actual pressed feedback without hover dependence.
- Drop: immediately mark valid destination and preserve its geometry while pending. Clear source/destination markers on success, cancellation, failure, and unmount. Announce a concise result; do not imply success before backend confirmation. Leave a failed operation's source visible and provide recovery.
- Loading: keep the last stable frame where safe; label stale/pending information honestly and disable invalid actions. No pulsing entire panes, staggered row entrances, or fake progress.
- Content collapsed out of view must be `hidden`/unmounted or inert as appropriate, never merely opacity zero. A translated-offscreen control must not remain keyboard reachable.
- Reduced motion: use the project's existing global override. Preserve all state and focus changes; remove sheet travel and smooth scrolling.

## Libraries

Keep the existing Svelte 5, plain CSS, Pointer Events, and browser scrolling stack. CSS transitions already support an interruptible two-state snap; Svelte transitions or WAAPI can handle a justified mount/exit if required. A React-specific drawer package would add framework mismatch. Motion's spring/gesture capabilities would become justified only if a genuine momentum-driven gesture is requested and a Svelte-compatible, maintained integration is verified. No dependency is proposed or installed.

The animation source recommends a component library for complex overlay accessibility. This preview is nonmodal and must preserve graph access, so copying modal drawer semantics would be incorrect. Reuse the project's established focus/navigation patterns and separately verify keyboard access.

## Verification cases

Run on the final production fixture at 390×844, 768×1024, and 1440×900:

1. Tap collapsed summary, collapse via handle, reopen, inspect full revision, Back; confirm selection and each pane's scroll position persist.
2. Drag handle up/down; cancel mid-gesture; reverse direction; attempt a secondary pointer; then click. No accidental click after drag and no stuck capture.
3. Scroll preview content vertically; scroll the graph beside it. Neither should start the sheet gesture.
4. Use keyboard to select revisions, invoke actions, expand preview, open full detail and return. Focus stays visible and reaches no hidden content.
5. Trigger forbidden/valid/canceled drops and backend error; inspect source/target markers, busy feedback, and recovery.
6. Slow selection query, stale revision, zero changes, long unbroken description/path, conflict, and multi-selection. No sheet jump or detached identity.
7. Repeat with reduced motion; verify computed animation/transition behavior and state semantics.

Record browser engine, viewport, input synthesis, console failures, and screenshots/traces. Emulated viewports establish layout; synthesized gestures establish only those browser event paths. Real hardware remains necessary for native touch feel.

## Sources and adaptations

Read current upstream instructions as documentation, without executing an installer. Archived source text is under `.taste-skill/studio/motion/`.

- [Emil animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md): frequency gate, cheapest tool, transform/opacity, exact drawer curve, interruption. Adaptation: keep the project's comprehensive reduced-motion disable rather than introducing a second token system.
- [Emil review-animations](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md): findings format, block unjustified motion, explicit verdict.
- [Emil mobile-native](https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md): `dvh`, safe areas, capability queries, dedicated gesture surfaces, actual hardware limits.
- [Emil break-ui](https://github.com/emilkowalski/skills/blob/main/skills/break-ui/SKILL.md): realistic worst-case content. Its fixture-only testing approach is retained; this review does not inject test data into production.
- [Impeccable adapt](https://github.com/pbakaus/impeccable/blob/main/skill/reference/adapt.md): preserve mobile functionality, test gestures and cross-axis scrolling, distinguish emulation from hardware.
- [Impeccable polish](https://github.com/pbakaus/impeccable/blob/main/skill/reference/polish.md): task completeness and state correctness precede visual motion; polish must not conceal redesign.
- Local `frontend-design` and `design-taste-frontend/references/app-screens.md`: app-screen restraint, genuine data states, preserve the project's stack. Marketing-page animation-count requirements do not apply.

## Bounded implementation and browser check

Implemented in `InspectorSheet.svelte`: stable-height transform snap (220ms, existing drawer token), expanded content retained with inert plus visibility hidden while collapsed, pointer identity/cancellation/lost-capture cleanup, 44px handle, and focus restoration only when focus was already inside the sheet. Graph selection keeps focus on its row. `Object.svelte` now cancels native dragstart for forbidden operands. No dependency added and no loading-overlay change made.

Chromium headless against the integrated Vite fixture at `http://127.0.0.1:7441`, 390×844, mouse plus synthetic pointer cancellation: selected revision remained focused; half→collapsed→half worked; visible collapsed height was exactly 72px; only one accessible button remained in collapsed sheet; preview scrollTop stayed 4 before/after collapse; handle drag collapsed; cancellation followed by tap reopened; reduced-motion computed transition was 0s; no page errors. Screenshots `sheet-half.png` and `sheet-collapsed.png`, script `smoke.mjs`, and raw measurements `smoke.json` are in `.taste-skill/studio/motion/`. The collapsed screenshot was visually inspected. This is a development-fixture check, not final production-build or hardware verification. `npm run check`: 0 errors, one existing scroll-region tabindex warning.

The initial code-review findings above describe the before state. Sheet continuity and forbidden-drag findings are now addressed; loading feedback remains a recommendation. Final feel and interruption should still be checked on physical touch hardware.


## Implemented follow-up

The handle now tracks the pointer within sheet bounds before settling. Content and the collapsed summary never initiate dragging. A second pointer, cancellation, lost capture, viewport change or selection change resets the pending gesture. The collapsed strip stays 72px with independent 44px handle and summary targets. Reduced motion removes settling transitions, and graph rows do not animate entrance.

Drops retain source/destination pending markers until the backend resolves, then clean up on success, failure, cancellation, blur or unmount. Operation feedback has one polite announcement; pending feedback waits 500ms to avoid flashes. Full inspection reserves a bottom status region while feedback is shown, keeping Back and Commands reachable. External tools report launch requested, not successful completion of a detached process.

Measured Full chrome at390×844 originally left613px for the diff; at390×390 it left159px. Removing the redundant36px Changes heading (the Files section already shows the count) increases these by36px without hiding controls. Back, revision identity and Commands remain fixed. We deliberately rejected automatic hide-on-scroll navigation: the height saving does not justify unpredictable access to return/actions. Files/Details and the collapsible description provide explicit inspection depth. No animation library was added: Pointer Events, CSS transitions and the existing Svelte lifecycle provide the required cancellation and reduced-motion behavior.
