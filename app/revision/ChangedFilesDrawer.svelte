<script lang="ts">
    import { tick, type Snippet } from "svelte";
    import PanelFooter from "../controls/PanelFooter.svelte";
    import Icon from "../controls/Icon.svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import RevisionFiles from "./RevisionFiles.svelte";
    import { clampHeight, filesDrawer, KEY_STEP, maxHeight, shouldClose } from "./filesDrawer";

    interface Props {
        changes: RevChange[];
        headers: RevHeader[];
        selectedPath: string;
        reviewKey: string;
        /** height of the diff view; the drawer never takes more than 70% of it */
        viewHeight: number;
        /** index of the selected file, or -1 */
        index: number;
        /** without a drawer the bar is just the handle's content, for compact panes */
        drawer?: boolean;
        onSelect: (change: RevChange) => void;
        children: Snippet;
    }

    let { changes, headers, selectedPath, reviewKey, viewHeight, index, drawer = true, onSelect, children }: Props = $props();
    let bodyId = "changed-files-drawer";
    let body = $state<HTMLElement>();
    let dragging = $state(false);
    // the live height while dragging; unclamped below so the drawer follows the pointer down to closing
    let dragHeight = $state(0);
    let origin = { y: 0, height: 0 };
    let limit = $derived(maxHeight(viewHeight));
    let open = $derived($filesDrawer.open);
    let shownHeight = $derived(dragging ? dragHeight : open ? clampHeight($filesDrawer.height, viewHeight) : 0);

    function toggle() {
        filesDrawer.toggle();
    }
    function start(event: PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        origin = { y: event.clientY, height: open ? clampHeight($filesDrawer.height, viewHeight) : 0 };
        dragHeight = origin.height;
        dragging = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    function move(event: PointerEvent) {
        if (!dragging) return;
        dragHeight = Math.min(limit, Math.max(0, origin.height + origin.y - event.clientY));
    }
    function finish(commit: boolean) {
        if (!dragging) return;
        dragging = false;
        if (!commit) return;
        if (shouldClose(dragHeight)) filesDrawer.setOpen(false);
        else filesDrawer.set({ open: true, height: clampHeight(dragHeight, viewHeight) });
    }
    function key(event: KeyboardEvent) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let current = open ? clampHeight($filesDrawer.height, viewHeight) : 0;
        if (event.key === "ArrowUp") filesDrawer.set({ open: true, height: open ? clampHeight(current + KEY_STEP, viewHeight) : $filesDrawer.height });
        else if (event.key === "ArrowDown") { if (open) filesDrawer.setHeight(clampHeight(current - KEY_STEP, viewHeight)); }
        else if (event.key === "Home") filesDrawer.setOpen(false);
        else if (event.key === "End") filesDrawer.set({ open: true, height: limit });
        else if (event.key === "Enter" || event.key === " ") toggle();
        else return;
        event.preventDefault();
    }

    // the selected row is brought into view when the drawer opens
    let wasOpen = false;
    $effect(() => {
        let showing = open && drawer;
        if (showing && !wasOpen) void tick().then(() => body?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
        wasOpen = showing;
    });
</script>

<div class="changed-files">
    <div class="handle">
        {#if drawer}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator follows the window splitter pattern) -->
            <div class="drag-strip" class:dragging role="separator" aria-label="Resize changed files" aria-orientation="horizontal" aria-controls={bodyId} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.round(shownHeight)} tabindex="0"
                onpointerdown={start} onpointermove={move} onpointerup={() => finish(true)} onpointercancel={() => finish(false)} onlostpointercapture={() => finish(true)} onkeydown={key}></div>
        {/if}
        <PanelFooter className="diff-footer"><div class="diff-toolbar">
            {@render children()}
            {#if drawer}
                {#if index >= 0}<span class="position">{index + 1} of {changes.length}</span>{/if}
                <button class="drawer-toggle" type="button" aria-expanded={open} aria-controls={bodyId} aria-label={open ? "Hide changed files" : "Show changed files"} title={open ? "Hide changed files" : "Show changed files"} onclick={toggle}><Icon name={open ? "chevron-down" : "chevron-up"} /></button>
            {/if}
        </div></PanelFooter>
    </div>
    {#if drawer}
        <div class="drawer-body" id={bodyId} class:dragging style:height="{shownHeight}px" bind:this={body}>
            {#if open || dragging}
                <RevisionFiles {changes} {headers} {selectedPath} {reviewKey} visible overlay={false} showHeading={false} inline id="changed-files-list" {onSelect} />
            {/if}
        </div>
    {/if}
</div>

<style>
    .changed-files { display: flex; flex-direction: column; flex: none; min-width: 0; }
    .handle { position: relative; flex: none; }
    .drag-strip { position: absolute; inset-inline: 0; inset-block-start: 0; z-index: 2; height: 0; cursor: row-resize; touch-action: none; user-select: none; pointer-events: auto; }
    .drag-strip::before { content: ""; position: absolute; inset-inline: 0; inset-block: calc(-1 * var(--space-1)); }
    .drag-strip::after { content: ""; position: absolute; inset-inline: var(--view-radius); inset-block-start: -1px; height: 2px; border-radius: var(--radius-sm); background: transparent; pointer-events: none; transition: background var(--motion-feedback) ease-out; }
    .drag-strip:focus-visible { outline: none; }
    .drag-strip.dragging::after, .drag-strip:focus-visible::after { background: var(--accent); }
    @media (hover: hover) { .drag-strip:hover::after { background: var(--control-hover); } .drag-strip.dragging:hover::after { background: var(--accent); } }
    @media (pointer: coarse) { .drag-strip::before { inset-block: calc(-2 * var(--space-1)); } }
    .drawer-body { display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--surface); transition: height var(--motion-feedback) ease-out; }
    .drawer-body.dragging { transition: none; }
    .drawer-body > :global(aside) { flex: 1; }
    .diff-toolbar { display: flex; align-items: center; gap: var(--space-1); width: 100%; min-width: 0; min-height: var(--control-height); }
    .diff-toolbar > :global(.file-path) { flex: 1; min-width: 0; }
    .diff-toolbar :global(.file-path .layout) { min-height: 32px; padding: var(--space-1); }
    .diff-toolbar :global(.file-path .layout span) { white-space: nowrap; }
    .diff-toolbar :global(.file-navigation) { display: flex; align-items: center; flex-shrink: 0; }
    .position { flex: none; padding-inline: var(--space-2); color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }
    /* only the bar's own icon buttons; the review control and file path bring their own */
    .diff-toolbar :global(.file-navigation button), .drawer-toggle { display: inline-flex; align-items: center; justify-content: center; padding: 0; width: 24px; min-height: 28px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 15px; }
    .diff-toolbar :global(.review-back) { width: auto; min-height: 28px; padding-inline: var(--space-2); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; font: var(--font-label); white-space: nowrap; }
    .diff-toolbar :global(.file-navigation button:disabled) { color: var(--text-disabled); cursor: default; }
    @media (hover: hover) { .diff-toolbar :global(.file-navigation button:not(:disabled):hover), .diff-toolbar :global(.review-back:hover), .drawer-toggle:hover { background: var(--hover); color: var(--text); } }
    .diff-toolbar :global(.file-navigation button:not(:disabled):active), .diff-toolbar :global(.review-back:active), .drawer-toggle:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .diff-toolbar :global(.file-path .layout) { min-height: 44px; } .diff-toolbar :global(.file-navigation button), .drawer-toggle { min-width: 44px; min-height: 44px; } }
</style>
