<script lang="ts">
    import DockFrame from './DockFrame.svelte';
    import type { Query } from "../events";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RevsResult } from "../messages/RevsResult";
    import type { RevChange } from "../messages/RevChange";
    import PanelGroup from "../controls/PanelGroup.svelte";
    import PanelTabs from "../controls/PanelTabs.svelte";
    import type { DockNode, Edge, PanelId } from "./dock";
    import { panelLabelFor } from "./panels";
    import { pluginContributions } from "../plugins/contributions";
    import PanelBody from "./PanelBody.svelte";
    import { annotations, lineMenu } from "../annotations/store";
    import { menuPanel } from "./viewCommands";

    interface Props {
        node: DockNode;
        path?: number[];
        workspace: Extract<RepoConfig, { type: "Workspace" }>;
        selection: Query<RevsResult>;
        detail: Extract<RevsResult, { type: "Detail" }> | null;
        changes: RevChange[];
        selectedPath: string;
        reviewKey: string;
        onClose: (id: PanelId) => void;
        onMove: (id: PanelId, target: PanelId, edge: Edge) => void;
        onResize: (path: number[], ratio: number) => void;
        onFocus: (id: PanelId) => void;
        onSelectFile: (change: RevChange) => void;
    }

    let {
        node,
        path = [],
        workspace,
        selection,
        detail,
        changes,
        selectedPath,
        reviewKey,
        onClose,
        onMove,
        onResize,
        onFocus,
        onSelectFile
    }: Props = $props();

    // right-clicking anywhere in a view offers to open another; text fields and selected text keep the native menu
    function noteMenuPanel(id: PanelId) { menuPanel.set(id); }
    function emptyMenu(event: MouseEvent, id: PanelId) {
        if (event.defaultPrevented) return;
        let target = event.target as HTMLElement;
        if (target.closest("input, textarea, select, [contenteditable='true']") || (getSelection()?.toString() ?? "").trim()) return;
        event.preventDefault();
        menuPanel.set(id);
        lineMenu.set({ x: event.clientX, y: event.clientY, heading: null, commands: [] });
    }
    let frame = $state<HTMLDivElement>();
    // plain content ignores the pointer, so a click there would leave focus on the page; the view claims it instead
    $effect(() => {
        let element = frame;
        if (!element) return;
        let pending: ReturnType<typeof setTimeout> | undefined;
        function claim(event: PointerEvent) {
            let bounds = element!.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom) return;
            clearTimeout(pending);
            pending = setTimeout(() => {
                if (!document.activeElement || document.activeElement === document.body) element!.focus({ preventScroll: true });
            });
        }
        window.addEventListener("pointerdown", claim, true);
        return () => { window.removeEventListener("pointerdown", claim, true); clearTimeout(pending); };
    });
    let resizing = $state(false);
    let openNotes = $derived($annotations.filter(thread => thread.status === "open").length);
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
    <div class="split" class:row={node.direction === "row"} style={node.direction === "row" ? `grid-template-columns: ${node.ratio}fr var(--dock-gutter) ${1 - node.ratio}fr` : `grid-template-rows: ${node.ratio}fr var(--dock-gutter) ${1 - node.ratio}fr`}>
        <DockFrame node={node.first} path={[...path, 0]} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onClose} {onMove} {onResize} {onFocus} {onSelectFile} />
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (the focusable separator follows the window splitter pattern) -->
        <button type="button" class="separator" class:dragging={resizing} role="separator" aria-label="Resize panels" aria-orientation={node.direction === "row" ? "vertical" : "horizontal"} aria-valuemin={16} aria-valuemax={84} aria-valuenow={Math.round(node.ratio * 100)}
            onpointerdown={event => { event.preventDefault(); resizing = true; event.currentTarget.setPointerCapture(event.pointerId); }}
            onpointermove={moveSplitter} onpointerup={() => resizing = false} onpointercancel={() => resizing = false} onlostpointercapture={() => resizing = false} onkeydown={splitterKey}></button>
        <DockFrame node={node.second} path={[...path, 1]} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onClose} {onMove} {onResize} {onFocus} {onSelectFile} />
    </div>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions (the same views are in the Views menu) -->
    <div class="tabs" bind:this={frame} tabindex="-1" data-panel-group={node.active} oncontextmenucapture={() => node.type === "tabs" && noteMenuPanel(node.active)} oncontextmenu={event => node.type === "tabs" && emptyMenu(event, node.active)}>
        <PanelGroup>
            <PanelTabs items={node.panels.map(id => ({ id, label: panelLabelFor(id, $pluginContributions), count: id === "tree" || id === "diff" ? changes.length : id === "annotations" ? openNotes || undefined : undefined }))} active={node.active} draggable
                onSelect={onFocus} {onClose} {onMove} />
            <div class="stack">
                {#each node.panels as id (id)}
                    <div class="panel-body" id="panel-{id}" role={node.panels.length > 1 ? "tabpanel" : "region"} aria-labelledby="panel-tab-{id}" hidden={node.active !== id} inert={node.active !== id}>
                        <PanelBody {id} active={node.active === id} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} {onSelectFile} />
                    </div>
                {/each}
            </div>
        </PanelGroup>
    </div>
{/if}

<style>
    .split, .tabs { height: 100%; min-width: 0; min-height: 0; }
    .split { display: grid; }
    .tabs { position: relative; isolation: isolate; display: flex; flex-direction: column; overflow: hidden; border-radius: var(--view-radius); background: var(--surface); }
    .tabs:focus { outline: none; }
    /* the whole view, title bar included, so no gutter or padding breaks the edge */
    .tabs::after { content: ""; position: absolute; inset: 0; z-index: 10; pointer-events: none; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--view-edge); transition: box-shadow var(--motion-feedback) ease-out; }
    .tabs:focus-within::after { box-shadow: inset 0 0 0 1px var(--view-focus-ring); }
    @media (prefers-reduced-motion: reduce) { .tabs::after { transition: none; } }
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
    /* the gutter between tiles is the handle; a centred line appears only while it is in use */
    .separator::after { content: ""; position: absolute; border-radius: var(--radius-sm); background: transparent; pointer-events: none; transition: background var(--motion-feedback) ease-out; }
    .row > .separator::after { inset-block: var(--view-radius); inset-inline-start: calc(50% - 1px); width: 2px; }
    .split:not(.row) > .separator::after { inset-inline: var(--view-radius); inset-block-start: calc(50% - 1px); height: 2px; }
    .separator:focus-visible { outline: none; }
    .separator.dragging::after, .separator:focus-visible::after { background: var(--accent); }
    @media (hover: hover) { .separator:hover::after { background: var(--control-hover); } }
    @media (pointer: coarse) { .row > .separator::before { inset-inline: -10px; } .split:not(.row) > .separator::before { inset-block: -10px; } }
</style>
