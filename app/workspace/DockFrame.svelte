<script lang="ts">
    import type { Query } from "../events";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RevsResult } from "../messages/RevsResult";
    import type { RevChange } from "../messages/RevChange";
    import PanelTabs from "../controls/PanelTabs.svelte";
    import type { DockNode, Edge, PanelId } from "./dock";
    import { draggedPanel, panelDrag, setDraggedPanel } from "./dock";
    import { panelLabel } from "./panels";
    import PanelBody from "./PanelBody.svelte";

    export let node: DockNode;
    export let path: number[] = [];
    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    export let selection: Query<RevsResult>;
    export let detail: Extract<RevsResult, { type: "Detail" }> | null;
    export let changes: RevChange[];
    export let selectedPath: string;
    export let reviewKey: string;
    export let onClose: (id: PanelId) => void;
    export let onMove: (id: PanelId, target: PanelId, edge: Edge) => void;
    export let onResize: (path: number[], ratio: number) => void;
    export let onFocus: (id: PanelId) => void;
    export let onSelectFile: (change: RevChange) => void;

    let resizing = false;
    let hint: Edge | null = null;

    function startDrag(event: DragEvent, id: PanelId) {
        setDraggedPanel(id);
        event.dataTransfer?.setData("application/x-gg-panel", id);
        event.dataTransfer?.setData("text/plain", panelLabel[id]);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    }

    function finishDrag() {
        setDraggedPanel(null);
        hint = null;
    }

    function clearHint(event: DragEvent) {
        let next = event.relatedTarget;
        if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
        hint = null;
    }

    function allowDrop(event: DragEvent, edge: Edge) {
        if (!draggedPanel()) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        hint = edge;
    }

    function dropOn(target: PanelId, edge: Edge) {
        let id = draggedPanel();
        finishDrag();
        if (id) onMove(id, target, edge);
    }

    function moveSplitter(event: PointerEvent) {
        if (!resizing || node.type !== "split") return;
        let container = (event.currentTarget as HTMLElement).parentElement!;
        let bounds = container.getBoundingClientRect();
        let rtl = getComputedStyle(container).direction === "rtl";
        let ratio = node.direction === "row"
            ? (rtl ? bounds.right - event.clientX : event.clientX - bounds.left) / bounds.width
            : (event.clientY - bounds.top) / bounds.height;
        onResize(path, ratio);
    }

    function splitterKey(event: KeyboardEvent) {
        if (node.type !== "split") return;
        let rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl";
        let rowSign = rtl ? -1 : 1;
        let next = node.ratio;
        if (event.key === "Home") next = 0.16;
        else if (event.key === "End") next = 0.84;
        else if (event.key === "ArrowLeft" && node.direction === "row") next = node.ratio - 0.04 * rowSign;
        else if (event.key === "ArrowRight" && node.direction === "row") next = node.ratio + 0.04 * rowSign;
        else if (event.key === "ArrowUp" && node.direction === "column") next = node.ratio - 0.04;
        else if (event.key === "ArrowDown" && node.direction === "column") next = node.ratio + 0.04;
        else return;
        onResize(path, next);
        event.preventDefault();
    }
</script>

{#if node.type === "split"}
    <div class="split" class:row={node.direction === "row"} style={node.direction === "row" ? `grid-template-columns: ${node.ratio}fr 1px ${1 - node.ratio}fr` : `grid-template-rows: ${node.ratio}fr 1px ${1 - node.ratio}fr`}>
        <svelte:self node={node.first} path={[...path, 0]} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onClose} {onMove} {onResize} {onFocus} {onSelectFile} />
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (the focusable separator follows the window splitter pattern) -->
        <button type="button" class="separator" class:dragging={resizing} role="separator" aria-label="Resize panels" aria-orientation={node.direction === "row" ? "vertical" : "horizontal"} aria-valuemin={16} aria-valuemax={84} aria-valuenow={Math.round(node.ratio * 100)}
            on:pointerdown={event => { event.preventDefault(); resizing = true; event.currentTarget.setPointerCapture(event.pointerId); }}
            on:pointermove={moveSplitter} on:pointerup={() => resizing = false} on:pointercancel={() => resizing = false} on:lostpointercapture={() => resizing = false} on:keydown={splitterKey}></button>
        <svelte:self node={node.second} path={[...path, 1]} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onClose} {onMove} {onResize} {onFocus} {onSelectFile} />
    </div>
{:else}
    <div class="tabs">
        <PanelTabs items={node.panels.map(id => ({ id, label: panelLabel[id], count: id === "tree" ? changes.length : undefined }))} active={node.active} draggable drop={hint === "tab" && !!$panelDrag}
            onSelect={onFocus} {onClose} onDragStart={startDrag} onDragEnd={finishDrag}
            onDragOver={event => allowDrop(event, "tab")} onDragLeave={clearHint} onDrop={id => dropOn(id, "tab")} />
        <!-- svelte-ignore a11y_no_static_element_interactions (drop target for a panel drag) -->
        <div class="stack" on:dragleave={clearHint}>
            {#each node.panels as id (id)}
                <div class="panel-body" id="panel-{id}" role="tabpanel" aria-labelledby="panel-tab-{id}" hidden={node.active !== id} inert={node.active !== id}>
                    <PanelBody {id} active={node.active === id} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onSelectFile} />
                </div>
            {/each}
            {#if $panelDrag}
                {#each ["left", "right", "top", "bottom"] as edge}
                    <!-- svelte-ignore a11y_no_static_element_interactions (drop target for a panel drag) -->
                    <div class="edge {edge}" on:dragover={event => { allowDrop(event, edge as Edge); event.stopPropagation(); }} on:drop|preventDefault|stopPropagation={() => dropOn(node.active, edge as Edge)}></div>
                {/each}
                {#if hint && hint !== "tab"}<span class="drop-line {hint}"></span>{/if}
            {/if}
        </div>
    </div>
{/if}

<style>
    .split, .tabs { height: 100%; min-width: 0; min-height: 0; }
    .split { display: grid; }
    .tabs { display: flex; flex-direction: column; overflow: hidden; background: var(--surface); }
    .stack { position: relative; flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
    .panel-body { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .panel-body[hidden] { display: none; }
    .panel-body > :global(*) { flex: 1; min-height: 0; min-width: 0; }
    .separator { position: relative; z-index: 2; margin: 0; padding: 0; border: 0; background: transparent; touch-action: none; user-select: none; }
    .row > .separator { cursor: col-resize; }
    .split:not(.row) > .separator { cursor: row-resize; }
    .separator::before { content: ""; position: absolute; }
    .row > .separator::before { inset-block: 0; inset-inline: -5px; }
    .split:not(.row) > .separator::before { inset-inline: 0; inset-block: -5px; }
    .separator::after { content: ""; position: absolute; background: var(--rule); pointer-events: none; }
    .row > .separator::after { inset-block: 0; inset-inline-start: 0; width: 1px; }
    .split:not(.row) > .separator::after { inset-inline: 0; inset-block-start: 0; height: 1px; }
    .separator:focus-visible { outline: none; }
    .separator.dragging, .separator:focus-visible { background: var(--accent-subtle); }
    .separator.dragging::after, .separator:focus-visible::after { background: var(--accent); }
    .edge { position: absolute; z-index: 3; }
    .edge.left, .edge.right { inset-block: 0; width: 16px; }
    .edge.left { inset-inline-start: 0; }
    .edge.right { inset-inline-end: 0; }
    .edge.top, .edge.bottom { inset-inline: 0; height: 16px; }
    .edge.top { inset-block-start: 0; }
    .edge.bottom { inset-block-end: 0; }
    .drop-line { position: absolute; z-index: 4; background: var(--accent); pointer-events: none; }
    .drop-line.left, .drop-line.right { inset-block: 0; width: 1px; }
    .drop-line.left { inset-inline-start: 0; }
    .drop-line.right { inset-inline-end: 0; }
    .drop-line.top, .drop-line.bottom { inset-inline: 0; height: 1px; }
    .drop-line.top { inset-block-start: 0; }
    .drop-line.bottom { inset-block-end: 0; }
    @media (hover: hover) {
        .separator:hover { background: var(--hover); }
        .separator:hover::after { background: var(--control-hover); }
    }
    @media (pointer: coarse) { .row > .separator::before { inset-inline: -10px; } .split:not(.row) > .separator::before { inset-block: -10px; } }
</style>
