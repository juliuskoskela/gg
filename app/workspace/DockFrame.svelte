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
    import { isTextField, textFieldCommands } from "../commands/textCommands";

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

    // right-clicking anywhere in a view offers to open another; text fields get the edit commands in the app's own menu,
    // and selected text or an editable surface no component claimed keeps the native one
    function noteMenuPanel(id: PanelId) { menuPanel.set(id); }
    function emptyMenu(event: MouseEvent, id: PanelId) {
        if (event.defaultPrevented) return;
        let target = event.target as HTMLElement;
        let field = target.closest("input, textarea");
        if (isTextField(field)) {
            event.preventDefault();
            let { clientX: x, clientY: y } = event;
            void textFieldCommands(field).then(commands => lineMenu.set({ x, y, heading: null, commands }));
            return;
        }
        if (field || target.closest("select, [contenteditable]:not([contenteditable='false'])") || (getSelection()?.toString() ?? "").trim()) return;
        event.preventDefault();
        menuPanel.set(id);
        lineMenu.set({ x: event.clientX, y: event.clientY, heading: null, commands: [], views: true });
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
            <PanelTabs items={node.panels.map(id => ({ id, label: panelLabelFor(id, $pluginContributions), count: id === "diff" ? changes.length : id === "annotations" ? openNotes || undefined : undefined }))} active={node.active} draggable
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
    /* every seam is drawn once, by the view before it: each view borders its trailing and bottom sides, and the
       dock borders its own top and leading sides. borders snap to whole device pixels where gaps would smear */
    .tabs { position: relative; isolation: isolate; display: flex; flex-direction: column; box-sizing: border-box; border-inline-end: var(--line-width) solid var(--line-seam); border-block-end: var(--line-width) solid var(--line-seam); border-radius: var(--view-radius); background: var(--surface); transition: border-color var(--motion-feedback) ease-out; }
    /* content clips inside the view, so the focus strips below can sit outside the view's own box */
    .tabs > :global(*) { overflow: hidden; }
    .tabs:focus { outline: none; }
    /* the focused view traces its edge on its seams, never beside them. it owns its trailing and bottom seams, so it
       recolours them; its leading and top seams belong to a neighbour or the dock, so a strip ends exactly at the view's
       edge and draws a border of the same width inward from there. both lines start from the same edge with the same
       width, so they land on the same device pixels at any zoom without knowing the device pixel ratio */
    .tabs:focus-within { z-index: 3; border-color: var(--view-focus-ring); }
    .tabs::before, .tabs::after { content: ""; position: absolute; z-index: 10; pointer-events: none; border: 0 solid transparent; transition: border-color var(--motion-feedback) ease-out; }
    .tabs::before { inset-inline-end: 100%; inset-block: calc(-1 * var(--line-width)); width: 0; border-inline-end-width: var(--line-width); }
    .tabs::after { inset-block-end: 100%; inset-inline: 0 calc(-1 * var(--line-width)); height: 0; border-block-end-width: var(--line-width); }
    .tabs:focus-within::before, .tabs:focus-within::after { border-color: var(--view-focus-ring); }
    @media (prefers-reduced-motion: reduce) { .tabs, .tabs::before, .tabs::after { transition: none; } }
    .stack { position: relative; flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
    .panel-body { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .panel-body[hidden] { display: none; }
    .panel-body > :global(*) { flex: 1; min-height: 0; min-width: 0; }
    .separator { position: relative; z-index: 4; margin: 0; padding: 0; border: 0; background: transparent; touch-action: none; user-select: none; }
    .row > .separator { cursor: col-resize; }
    .split:not(.row) > .separator { cursor: row-resize; }
    .separator::before { content: ""; position: absolute; }
    /* the seam takes no space, so the handle is a box straddling it over both views */
    .row > .separator { margin-inline: calc(-1 * var(--splitter-reach)); }
    .split:not(.row) > .separator { margin-block: calc(-1 * var(--splitter-reach)); }
    .row > .separator::before { inset: 0; }
    .split:not(.row) > .separator::before { inset: 0; }
    /* the handle sits over the seam; an indicator-width border along it marks the handle in use */
    .separator::after { content: ""; position: absolute; border: 0 solid transparent; border-radius: var(--radius-sm); pointer-events: none; transition: border-color var(--motion-feedback) ease-out; }
    .row > .separator::after { inset-block: 0; inset-inline-start: calc(50% - var(--indicator-width) / 2); width: 0; border-inline-start-width: var(--indicator-width); }
    .split:not(.row) > .separator::after { inset-inline: 0; inset-block-start: calc(50% - var(--indicator-width) / 2); height: 0; border-block-start-width: var(--indicator-width); }
    .separator:focus-visible { outline: none; }
    .separator.dragging::after, .separator:focus-visible::after { border-color: var(--accent); }
    @media (hover: hover) { .separator:hover::after { border-color: var(--control-hover); } }
    @media (pointer: coarse) { .row > .separator::before { inset-inline: calc(-1 * var(--splitter-reach)); } .split:not(.row) > .separator::before { inset-block: calc(-1 * var(--splitter-reach)); } }
</style>
