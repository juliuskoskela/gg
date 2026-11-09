<script lang="ts">
    import { revisionNodeOffset, revisionNodeRadius, revisionRowHeight } from "./graphLayout";
    import type { RevHeader } from "./messages/RevHeader";
    import { currentContext, revisionSelectEvent } from "./stores.js";

    interface Props {
        header: RevHeader;
        rowHeight?: number;
        authorSpace?: number;
        lane?: number;
    }

    let {
        header,
        rowHeight = revisionRowHeight,
        authorSpace = 0,
        lane = 0
    }: Props = $props();

    let context = $derived($currentContext?.type == "Revision" && header == $currentContext.header);
    let selected = $derived($revisionSelectEvent?.from.commit.hex === header.id.commit.hex || $revisionSelectEvent?.to.commit.hex === header.id.commit.hex);
    let cy = $derived(revisionNodeOffset(rowHeight, authorSpace));
    let r = $derived(revisionNodeRadius);
    // diamond matches jj's ◆ glyph for immutable history
    let diamond = $derived(`M9,${cy - r - 0.5} L${9 + r + 0.5},${cy} L9,${cy + r + 0.5} L${9 - r - 0.5},${cy} Z`);
</script>

<g class="station" class:workspace={header.is_working_copy} style="--lane: var(--lane-{lane % 8})">
    {#if selected}<circle class="halo" cx="9" {cy} r={r + 4} />{/if}

    {#if header.is_working_copy}
        <circle class="ring" cx="9" {cy} r={r + 0.5} />
        <circle class="core" cx="9" {cy} r="2.25" />
    {:else if header.is_immutable}
        <path class="immutable" d={diamond} />
    {:else}
        <circle class="mutable" cx="9" {cy} r={r - 0.25} />
    {/if}

    {#if context}<circle class="context" cx="9" {cy} r={r + 4} />{/if}
</g>

<style>
    .station { pointer-events: none; --station: var(--lane); }
    .station.workspace { --station: var(--brand); }
    circle, path { pointer-events: none; }

    .mutable { fill: var(--station); }
    .immutable { fill: var(--station); }

    .ring { fill: none; stroke: var(--station); stroke-width: 2; }
    .core { fill: var(--station); }

    .halo { fill: color-mix(in oklab, var(--station) 20%, transparent); stroke: color-mix(in oklab, var(--station) 50%, transparent); stroke-width: 1; }
    .context { fill: none; stroke: var(--graph-context); stroke-width: 1.25; stroke-dasharray: 2 2; }

    @media (forced-colors: active) {
        .mutable, .immutable, .core { fill: CanvasText; }
        .ring { stroke: CanvasText; }
        .halo { fill: none; stroke: Highlight; }
    }
</style>
