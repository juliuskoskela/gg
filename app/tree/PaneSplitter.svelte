<script lang="ts">
    import { PANE_KEY_STEP, isHorizontal, type PaneSide } from "./placement";

    interface Props {
        side: PaneSide;
        /** the pane's current width (left, right) or height (top, bottom) */
        size: number;
        min: number;
        max: number;
        label: string;
        controls?: string;
        /** asked for a new size; the owner clamps and remembers it */
        onResize: (size: number) => void;
        onDragging?: (dragging: boolean) => void;
    }

    let { side, size, min, max, label, controls, onResize, onDragging }: Props = $props();
    let horizontal = $derived(isHorizontal(side));
    let dragging = $state(false);
    let origin = { point: 0, size: 0 };

    // which way the pointer or an arrow key must move to grow the pane: away from the edge it sits on, mirrored in right-to-left text
    function growth(element: HTMLElement): number {
        if (!horizontal) return side === "top" ? 1 : -1;
        let rtl = getComputedStyle(element).direction === "rtl" ? -1 : 1;
        return (side === "left" ? 1 : -1) * rtl;
    }

    function key(event: KeyboardEvent) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let forward = horizontal ? "ArrowRight" : "ArrowDown";
        let backward = horizontal ? "ArrowLeft" : "ArrowUp";
        let sign = growth(event.currentTarget as HTMLElement);
        if (event.key === forward) onResize(size + PANE_KEY_STEP * sign);
        else if (event.key === backward) onResize(size - PANE_KEY_STEP * sign);
        else if (event.key === "Home") onResize(min);
        else if (event.key === "End") onResize(max);
        else return;
        event.preventDefault();
    }

    function down(event: PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        origin = { point: horizontal ? event.clientX : event.clientY, size };
        dragging = true;
        onDragging?.(true);
        // a pointer that is already gone has nothing to capture
        try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* the drag still follows moves over the separator */ }
    }
    function move(event: PointerEvent) {
        if (!dragging) return;
        let point = horizontal ? event.clientX : event.clientY;
        onResize(origin.size + (point - origin.point) * growth(event.currentTarget as HTMLElement));
    }
    function up() {
        if (!dragging) return;
        dragging = false;
        onDragging?.(false);
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (a focusable separator follows the window splitter pattern) -->
<div class="splitter {side}" class:dragging role="separator" tabindex="0" aria-label={label} aria-orientation={horizontal ? "vertical" : "horizontal"} aria-controls={controls}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(size)}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up} onkeydown={key}></div>

<style>
    /* it straddles the pane's inner edge, and the line shows only when it is used */
    .splitter { position: absolute; z-index: 2; touch-action: none; user-select: none; pointer-events: auto; }
    .splitter.left, .splitter.right { inset-block: 0; inline-size: var(--space-2); cursor: col-resize; }
    .splitter.left { inset-inline-end: calc(-1 * var(--space-1)); }
    .splitter.right { inset-inline-start: calc(-1 * var(--space-1)); }
    .splitter.top, .splitter.bottom { inset-inline: 0; block-size: var(--space-2); cursor: row-resize; }
    .splitter.top { inset-block-end: calc(-1 * var(--space-1)); }
    .splitter.bottom { inset-block-start: calc(-1 * var(--space-1)); }
    .splitter::after { content: ""; position: absolute; border-radius: var(--radius-sm); background: transparent; pointer-events: none; transition: background var(--motion-feedback) ease-out; }
    .splitter.left::after, .splitter.right::after { inset-block: 0; inset-inline-start: calc(50% - 1px); inline-size: 2px; }
    .splitter.top::after, .splitter.bottom::after { inset-inline: 0; inset-block-start: calc(50% - 1px); block-size: 2px; }
    .splitter:focus-visible { outline: none; }
    .splitter.dragging::after, .splitter:focus-visible::after { background: var(--accent); }
    @media (hover: hover) { .splitter:hover::after { background: var(--control-hover); } .splitter.dragging:hover::after { background: var(--accent); } }
    @media (pointer: coarse) { .splitter.left, .splitter.right { inline-size: var(--space-4); } .splitter.top, .splitter.bottom { block-size: var(--space-4); } }
</style>
