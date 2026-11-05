# Navigation audit and implementation decisions

## Selected direction

Three interactive concepts used the same repository snapshot and viewport sizes: graph shelf, review deck, and command picker. The independent evaluator preferred the shelf for quick orientation and low interruption. The deck exposed diff/file choices too early; the command-led variant made users choose an action before understanding a revision. The adopted architecture combines the shelf with shared command discovery, constrained by the owner's subsequent binding specification: Half/Collapsed share one sheet; Full is a routed destination.

## Before and after

| Problem | Implemented response | Evidence |
| --- | --- | --- |
| Compact selection replaced the graph with panels and repeated headers. | Graph remains mounted; selecting opens a half-height nonmodal sheet. Full is explicit. | Route/history, graph scroll and generated 127-revision browser checks. |
| Repeated author lines misalign the change ID and description. | One 44px graph row aligns ID, description and node; authorship stays in preview/details. | Shared SVG/list row geometry and final visual inspection. |
| Header actions and pane toggles compete for narrow space. | Mobile repository header exposes identity/navigation and Commands. Desktop keeps stable panel controls and common sync actions. Full owns the viewport. | Seven-width light/dark screenshot matrix. |
| Returning from inspection is implicit pane visibility. | Full pushes one URL with exact revision, optional range and file. Back restores sheet state; repeated graph taps do not push. | Back/Forward, refresh, historical range and immediate Shift-range tests. |
| Desktop file navigator is fixed at 200px. | A pointer/keyboard splitter remembers width, with responsive limits that protect the diff. | Drag, RTL, reload, visibility and clamp checks. |
| File selection repeatedly loses reading position. | Focused-file reader, persistent path, per-file scroll, previous/next and searchable navigator. Above 200 files the navigator windows rows. | 30-file/500-line diff and 270-file navigator tests. |
| Actions are duplicated across surfaces. | Shared command definitions serve palette, revision menu and context menu. Disabled reasons and stale-selection guards are shared. | Registry, toolbar and context-menu tests. |
| Touch cannot comfortably rebase through drag alone. | Move revisions accepts a singleton destination revset, describes both endpoints and consequences, then invokes the existing drag policy/mutation. | Independent real Move → Undo in temporary repository. |
| Undo labels become opaque after recovery. | Contextual Undo labels shorten commit hashes; an undo operation offers Undo earlier operation. Current operation remains inspectable. | Independent palette/operation-view inspection. |
| Sheet collapse, loading and drag behavior lack a common rule. | Handle-only snapping, 72px peek, retained preview scroll, reduced-motion override, visible mutation progress and rejected-drag cancellation. | Pointer-cancel, collapsed accessibility and motion evidence. |

The final quality pass also found and fixed long-path ambiguity, an obscured last graph row, editor focus timing, overlapping background command exposure, and range synchronization. The graph reserves trailing scroll space while inspection exists, so the last revision can be moved above the sheet without resizing the graph's viewport.

## Deliberate limits

Focused-file is the single default diff model; continuous all-files mode was evaluated as a future option rather than added as another navigation choice. Existing diff style/wrapping controls remain. The backend still returns complete revision diff data; rendering one file and windowing a large navigator reduces mounted UI but is not network-level incremental diff loading. No performance benchmark is claimed.

Desktop retains existing graph/revision splits and persisted pane preferences; arbitrary dockable tabs are not part of this iteration. Future tools register through the view picker. The working Current operation extension is not a complete operation-log browser. Native menus and external diff/merge tools remain existing platform-specific capabilities. Real touch hardware, speech output, browser zoom, safe-area hardware behavior and native Tauri interaction need release testing; browser emulation is explicitly distinguished from these.

See [independent concept and workflow evaluation](evaluation.md), [quality validation](validation.md), [research](research.md) and [design system](design-system.md). Screenshots, Playwright traces and prototype sources live locally in ignored `.taste-skill/studio/`; application, tests and decisions are versioned.

## Full-scope follow-up

The initial foundation left important gaps: tool declarations were modal-only; file/hunk/bookmark commands were incomplete outside drag/context menus; summary inspection fetched every diff; sheet dragging did not continuously track the pointer. These are now implemented through the adaptive host, durable command operands/destination review, staged queries and handle-only pointer tracking.

Three structurally distinct prototypes were compared with shared content and tasks. The adaptive bounded host won because tools remain adjacent on desktop and are explicit destinations on compact screens without adding persistent navigation. Sibling tools replace history rather than multiplying Back steps. See [comparison](composition-evaluation.md) for measured prototype interactions and [implementation review](full-evaluation.md) for actual repository mutation evidence. Prototype mock actions are not counted as mutation tests.

The independent implementation review drove fixes to Undo selection/file restoration, notification placement, command source naming,320px popup clipping and tool rotation. Native testing additionally exposed WebKit's SVG scrolling-layer placement; graph reference chips now clip in place, with full metadata in Details. Physical-device and default-Wayland release gates remain explicit in [validation](validation.md).
