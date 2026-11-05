<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import type { Query } from "../events";
    import type { RevsResult } from "../messages/RevsResult";
    import Icon from "../controls/Icon.svelte";
    import SelectionRecovery from "../revision/SelectionRecovery.svelte";
    import RevisionPreview from "./RevisionPreview.svelte";

    export let selection: Query<RevsResult>;
    export let presentation: "closed" | "collapsed" | "half" | "full";
    export let onPresentation: (state: "collapsed" | "half") => void;
    export let onFull: (path?: string) => void;
    let sheet: HTMLElement;
    let dragStart: number | null = null;
    let dragOffset: number | null = null;
    let startOffset = 0;
    let travel = 0;
    let moved = false;
    let activePointer: number | null = null;
    let capture: HTMLElement | null = null;
    let gestureSelection = selection;
    let gesturePresentation = presentation;
    let frame = 0;
    $: if ((activePointer !== null || frame !== 0) && (selection !== gestureSelection || presentation !== gesturePresentation)) resetGesture();
    $: detail = selection.type === "data" && selection.value.type === "Detail" ? selection.value : null;
    $: header = detail?.headers[0];
    $: title = detail && detail.headers.length > 1 ? `${detail.headers.length} revisions` : header?.description.lines[0] || (selection.type === "wait" ? "Loading revision…" : "(no description set)");

    function measure(node: HTMLElement) {
        let observer = new ResizeObserver(() => {
            if (activePointer !== null || frame !== 0) resetGesture();
            travel = Math.max(0, node.clientHeight - (node.querySelector<HTMLElement>(".peek-sizer")?.clientHeight ?? 72));
        });
        observer.observe(node);
        let peek = node.querySelector<HTMLElement>(".peek-sizer");
        if (peek) observer.observe(peek);
        return { destroy: () => observer.disconnect() };
    }
    function release() {
        let pointer = activePointer;
        activePointer = null;
        dragStart = null;
        if (pointer !== null && capture?.hasPointerCapture(pointer)) capture.releasePointerCapture(pointer);
        capture = null;
    }
    function resetGesture() {
        release();
        moved = true;
        cancelAnimationFrame(frame);
        frame = 0;
        dragOffset = null;
    }
    function start(event: PointerEvent) {
        if (event.button !== 0 || activePointer !== null || !(event.currentTarget instanceof HTMLElement)) return;
        cancelAnimationFrame(frame);
        gestureSelection = selection;
        gesturePresentation = presentation;
        startOffset = new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
        dragOffset = Math.max(0, Math.min(travel, startOffset));
        activePointer = event.pointerId;
        dragStart = event.clientY;
        moved = false;
        capture = event.currentTarget;
        capture.setPointerCapture(event.pointerId);
    }
    function move(event: PointerEvent) {
        if (event.pointerId !== activePointer || dragStart === null) return;
        let distance = event.clientY - dragStart;
        if (Math.abs(distance) > 8) moved = true;
        dragOffset = Math.max(0, Math.min(travel, startOffset + distance));
    }
    function end(event: PointerEvent) {
        if (event.pointerId !== activePointer || dragStart === null) return;
        move(event);
        let destination: "collapsed" | "half" = (dragOffset ?? startOffset) > travel / 2 ? "collapsed" : "half";
        release();
        // retain the last tracked frame before enabling the settling transition.
        frame = requestAnimationFrame(() => {
            frame = 0;
            dragOffset = null;
            if (moved) changePresentation(destination);
        });
    }
    function cancel(event: PointerEvent) {
        if (event.pointerId === activePointer) resetGesture();
    }
    function windowBlur() { if (activePointer !== null || frame !== 0) resetGesture(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && (activePointer !== null || frame !== 0)) { event.preventDefault(); resetGesture(); } }
    onDestroy(() => { cancelAnimationFrame(frame); release(); });
    async function changePresentation(state: "collapsed" | "half") {
        let restoreFocus = sheet.contains(document.activeElement);
        onPresentation(state);
        await tick();
        if (restoreFocus) sheet.querySelector<HTMLButtonElement>(".sheet-handle")?.focus({ preventScroll: true });
    }
    function clickHandle(event: MouseEvent) { if (event.detail === 0 || !moved) { cancelAnimationFrame(frame); dragOffset = null; changePresentation(presentation === "collapsed" ? "half" : "collapsed"); } }
</script>

<svelte:window on:blur={windowBlur} on:keydown={escape} />

{#if presentation === "collapsed" || presentation === "half"}
    <section bind:this={sheet} use:measure class="inspector-sheet" class:tracking={activePointer !== null} style:transform={dragOffset === null ? undefined : `translateY(${dragOffset}px)`} class:collapsed={presentation === "collapsed"} data-presentation={presentation} aria-label="Revision preview">
        <div class="peek-sizer" aria-hidden="true"></div>
        <button class="sheet-handle" type="button" aria-label={presentation === "collapsed" ? "Expand revision preview" : "Collapse revision preview"} aria-expanded={presentation === "half"} on:pointerdown={start} on:pointermove={move} on:pointerup={end} on:pointercancel={cancel} on:lostpointercapture={cancel} on:click={clickHandle}><span class="grab-mark"></span><span class="handle-label">{presentation === "collapsed" ? "Expand" : "Collapse"}</span><Icon name={presentation === "collapsed" ? "chevron-up" : "chevron-down"} /></button>
        {#if presentation === "collapsed" && activePointer === null}
            <button class="collapsed-summary" type="button" aria-label={`Preview revision: ${title}${header?.is_working_copy ? ", working copy" : ""}${header?.has_conflict ? ", conflict" : ""}`} aria-expanded="false" on:click={() => changePresentation("half")}>
                <span class="collapsed-title">{title}</span><span class="collapsed-meta">{header?.id.change.hex.slice(0, 8)}{header?.is_working_copy ? " · Working copy" : ""}{header?.has_conflict ? " · Conflict" : ""}</span>
            </button>
        {/if}
        <div class="expanded-content" class:concealed={presentation === "collapsed" && activePointer === null} inert={presentation === "collapsed"}>
            <div class="preview-heading"><h2 id="preview-title" title={title}>{title}</h2><button type="button" aria-label="Open full revision" disabled={!detail} on:click={() => onFull()}><Icon name="maximize-2" /></button></div>
            <!-- svelte-ignore a11y_no_noninteractive_tabindex (overflow region needs keyboard scrolling) -->
            <div class="preview-scroll" role="region" tabindex="0" aria-label="Revision summary">
                {#if detail}<RevisionPreview revs={detail} {onFull} />{:else if selection.type === "error"}<SelectionRecovery /><p class="message" role="alert">Couldn’t load revision: {selection.message}</p>{:else if selection.type === "wait"}<p class="message" role="status">Loading revision…</p>{:else}<p class="message">This revision is no longer available. Select another revision in the graph.</p>{/if}
            </div>
            <div class="preview-footer"><button type="button" disabled={!detail} on:click={() => onFull()}>Inspect full revision <Icon name="arrow-right" /></button></div>
        </div>
    </section>
{/if}

<style>
    .inspector-sheet { position: absolute; z-index: 30; inset-inline: 0; inset-block-end: 0; height: min(52dvh, 85%); display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--sheet-surface, var(--raised)); border-block-start: 1px solid var(--sheet-border, var(--border)); border-radius: var(--sheet-radius, 12px) var(--sheet-radius, 12px) 0 0; box-shadow: var(--sheet-shadow, var(--shadow-overlay)); pointer-events: auto; overflow: hidden; transform: translateY(0); transition: transform var(--motion-sheet-duration, 220ms) var(--motion-sheet-ease, cubic-bezier(.32,.72,0,1)); }
    .inspector-sheet.collapsed { transform: translateY(calc(100% - var(--inspector-peek-height, 72px) - env(safe-area-inset-bottom))); }
    .inspector-sheet.tracking { transition: none; }
    .peek-sizer { position: absolute; height: calc(var(--inspector-peek-height, 72px) + env(safe-area-inset-bottom)); visibility: hidden; }
    .expanded-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .expanded-content.concealed { visibility: hidden; }
    .sheet-handle { position: relative; display: flex; align-items: center; justify-content: flex-end; min-height: 44px; padding: 4px 16px; gap: 4px; color: var(--muted); background: transparent; border: 0; cursor: ns-resize; touch-action: none; flex-shrink: 0; }
    .handle-label { font-size: 12px; }
    .grab-mark { width: 32px; height: 4px; border-radius: 2px; background: var(--control); position: absolute; inset-block-start: 10px; inset-inline-start: calc(50% - 16px); }
    .preview-heading { display: flex; align-items: center; gap: 8px; padding: 0 8px 4px 16px; flex-shrink: 0; }
    .preview-heading h2 { flex: 1; font-size: var(--type-title); line-height: 1.4; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .preview-heading button { border: 0; background: transparent; color: var(--text); min-width: 44px; min-height: 44px; display: grid; place-items: center; cursor: pointer; }
    .preview-scroll { flex: 1; min-height: 0; min-width: 0; overflow: auto; overscroll-behavior: contain; pointer-events: auto; }
    .preview-footer { flex-shrink: 0; padding: 4px 12px max(4px, env(safe-area-inset-bottom)); border-block-start: 1px solid var(--rule); }
    .preview-footer button { min-height: 44px; display: flex; align-items: center; justify-content: space-between; width: 100%; border: 0; border-radius: var(--radius-control); padding: 8px; color: var(--text); background: var(--hover); font-size: var(--type-ui); cursor: pointer; }
    .collapsed .sheet-handle { position: absolute; inset-block-start: 0; inset-inline-end: 0; width: 44px; height: calc(var(--inspector-peek-height, 72px) + env(safe-area-inset-bottom)); justify-content: center; padding: 0 0 env(safe-area-inset-bottom); z-index: 1; }
    .collapsed .handle-label { display: none; }
    .collapsed .grab-mark { width: 20px; inset-inline-start: 12px; }
    .collapsed-summary { position: absolute; inset-inline-start: 0; inset-block-start: 0; width: calc(100% - 44px); height: calc(var(--inspector-peek-height, 72px) + env(safe-area-inset-bottom)); padding: 12px 8px calc(12px + env(safe-area-inset-bottom)) 16px; text-align: start; border: 0; background: var(--sheet-surface, var(--raised)); color: var(--text); cursor: pointer; }
    .collapsed-title, .collapsed-meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .collapsed-title { font-size: var(--type-ui); font-weight: 500; }
    .collapsed-meta { margin-block-start: 4px; font-size: var(--type-caption); color: var(--muted); }
    .message { padding: 12px 16px; font-size: var(--type-ui); color: var(--muted); }
    @media (pointer: coarse) { .sheet-handle { min-height: 44px; } }
    @media (hover: hover) { button:hover { background: var(--hover); } }
</style>
