<script lang="ts">
    import { onDestroy, untrack, type Snippet } from "svelte";
    import PaneSplitter from "./PaneSplitter.svelte";
    import { clampPaneSize, isHorizontal, maxPaneSize, minPaneSize, type PaneSide } from "./placement";

    interface Props {
        side: PaneSide;
        open: boolean;
        /** the pane's width (left, right) or height (top, bottom), remembered by the owner */
        size: number;
        /** asked for a new size while the splitter moves; the owner remembers it */
        onResize: (size: number) => void;
        /** names the splitter, such as "Resize file tree" */
        label: string;
        /** the pane's id, for the toggle that shows and hides it */
        id?: string;
        /** a closed pane stays mounted, so its scroll position and filter survive */
        keepMounted?: boolean;
        content: Snippet;
        pane: Snippet;
    }

    let { side, open, size, onResize, label, id, keepMounted = false, content, pane }: Props = $props();
    let width = $state(0);
    let height = $state(0);
    let horizontal = $derived(isHorizontal(side));
    // 0 until measured
    let view = $derived(horizontal ? width : height);
    let min = $derived(minPaneSize(side));
    let max = $derived(maxPaneSize(side, view));
    // an unmeasured view keeps the remembered size rather than clamping it to a guess
    let fitted = $derived(view > 0 ? clampPaneSize(side, size, view, size) : size);
    let shown = $derived(open ? fitted : 0);

    // only opening and closing animate; reloads, resizes, remounts and drags change the size at once
    let animating = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasOpen = untrack(() => open);
    $effect.pre(() => {
        let now = open;
        if (now === wasOpen) return;
        wasOpen = now;
        animating = true;
        clearTimeout(timer);
        timer = setTimeout(() => animating = false, 400);
    });
    onDestroy(() => clearTimeout(timer));

    function resize(next: number) {
        onResize(view > 0 ? clampPaneSize(side, next, view, size) : Math.max(min, Math.round(next)));
    }
</script>

<div class="browser {side}" bind:clientWidth={width} bind:clientHeight={height}>
    <div class="pane" {id} class:animating class:present={open || animating} class:closed={!open && !animating} style:inline-size={horizontal ? `${shown}px` : undefined} style:block-size={horizontal ? undefined : `${shown}px`}>
        <div class="pane-body">{#if open || animating || keepMounted}{@render pane()}{/if}</div>
        {#if open}<PaneSplitter {side} size={fitted} {min} {max} {label} controls={id} onResize={resize} />{/if}
    </div>
    <div class="content">{@render content()}</div>
</div>

<style>
    .browser { display: flex; flex: 1; min-width: 0; min-height: 0; }
    .browser.left { flex-direction: row; }
    .browser.right { flex-direction: row-reverse; }
    .browser.top { flex-direction: column; }
    .browser.bottom { flex-direction: column-reverse; }
    .pane { position: relative; display: flex; flex: none; box-sizing: border-box; min-width: 0; min-height: 0; pointer-events: auto; }
    .pane.closed { visibility: hidden; }
    .pane.animating { transition: inline-size var(--motion-feedback) ease-out, block-size var(--motion-feedback) ease-out; }
    /* the seam sits on the pane's inner edge and runs end to end */
    .left > .pane.present { border-inline-end: 1px solid var(--view-inner-rule); }
    .right > .pane.present { border-inline-start: 1px solid var(--view-inner-rule); }
    .top > .pane.present { border-block-end: 1px solid var(--view-inner-rule); }
    .bottom > .pane.present { border-block-start: 1px solid var(--view-inner-rule); }
    .pane-body { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface); }
    .pane-body > :global(*) { flex: 1; min-height: 0; }
    .content { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
</style>
