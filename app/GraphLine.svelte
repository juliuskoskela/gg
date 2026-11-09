<script lang="ts">
    import { revisionNodeOffset, revisionNodeRadius, revisionRowHeight } from "./graphLayout";
    import type { EnhancedLine } from "./GraphLog.svelte";
    import type { Operand } from "./messages/Operand";
    import Zone from "./objects/Zone.svelte";
    import { currentTarget } from "./stores";

    export let line: EnhancedLine;
    export let rowHeight = revisionRowHeight;
    export let authorSpace = 0;

    $: isMerge = line.type == "ToIntersection";
    $: allowEarlyBreak = line.type == "FromNode";
    $: c1 = line.source[0];
    $: c2 = line.target[0];
    $: r1 = line.source[1];
    $: r2 = line.target[1];

    $: operand = { type: "Parent", header: line.parent, child: line.child } as Operand;

    // draw path downward, from child to parent
    let path: string;

    $: childY = r1 * rowHeight + revisionNodeOffset(rowHeight, authorSpace) + revisionNodeRadius;
    $: parentY = r2 * rowHeight + revisionNodeOffset(rowHeight, authorSpace) - revisionNodeRadius;

    type Block = { x: number; y: number; w: number; h: number };
    let blocks: Block[] = [];

    $: {
        blocks = [];
        if (isMerge) {
            // instead of a parent, we have a mergepoint
            let childX = c1 * 18 + 9;
            let mergeX = c2 * 18 + 9;
            let midY = c2> c1 ? childY + 9 : parentY - 9;
            let radius = c2> c1 ? 6 : -6;
            let sweep = c2> c1 ? 0 : 1;
            path = `M${childX},${childY}
                L${childX},${midY - 6}
                A6,6,0,0,${sweep},${childX + radius},${midY}
                L${mergeX - radius},${midY}
                A6,6,0,0,${1 - sweep},${mergeX},${midY + 6}
                L${mergeX},${parentY}`;

            blocks.push({
                x: c1 < c2 ? c1 * 18 + 2 : c2 * 18 + 2,
                y: midY - 8,
                w: c1 < c2 ? (c2 - c1 + 1) * 18 - 5 : (c1 - c2 + 1) * 18 - 5,
                h: 14,
            });
            // vertical segment at child column
            let topH = (midY - 6) - childY;
            if (topH> 2) {
                blocks.push({ x: c1 * 18 + 2, y: childY, w: 14, h: topH });
            }
            // vertical segment at merge column
            let bottomH = parentY - (midY + 6);
            if (bottomH> 2) {
                blocks.push({ x: c2 * 18 + 2, y: midY + 6, w: 14, h: bottomH });
            }
        } else if (c1 == c2) {
            // same-column, straight line
            let x = c1 * 18 + 9;

            path = `M${x},${childY} L${x},${parentY}`;

            blocks.push({
                x: c1 * 18 + 2,
                y: childY,
                w: 14,
                h: parentY - childY,
            });
        } else {
            // different-column, curved line
            let childX = c1 * 18 + 9;
            let parentX = c2 * 18 + 9;
            let midY = allowEarlyBreak && c1> c2 ? parentY - 9 : childY + 9;
            let radius = c2> c1 ? 6 : -6;
            let sweep = c2> c1 ? 0 : 1;
            path = `M${childX},${childY}
                L${childX},${midY - 6}
                A6,6,0,0,${sweep},${childX + radius},${midY}
                L${parentX - radius},${midY}
                A6,6,0,0,${1 - sweep},${parentX},${midY + 6}
                L${parentX},${parentY}`;

            // horizontal segment
            blocks.push({
                x: c1 < c2 ? c1 * 18 + 16 : c2 * 18 + 16,
                y: midY - 8,
                w: c1 < c2 ? (c2 - c1) * 18 - 14 : (c1 - c2) * 18 - 14,
                h: 14,
            });
            // vertical segment at child column
            let topH = (midY - 6) - childY;
            if (topH> 2) {
                blocks.push({ x: c1 * 18 + 2, y: childY, w: 14, h: topH });
            }
            // vertical segment at parent column
            let bottomH = parentY - (midY + 6);
            if (bottomH> 2) {
                blocks.push({ x: c2 * 18 + 2, y: midY + 6, w: 14, h: bottomH });
            }
        }
    }
</script>

{#if !line.indirect}
    {#each blocks as block}
        <foreignObject x={block.x} y={block.y} width={block.w} height={block.h}>
            <Zone {operand}>
    {#snippet children({ target })}
                <div class="backdrop" class:target></div>

    {/snippet}
</Zone>
        </foreignObject>
    {/each}
{/if}

<path d={path} fill="none" stroke-dasharray={line.indirect ? "1,3" : "none"} class:target={$currentTarget == operand} style="--lane: var(--lane-{Math.max(c1, c2) % 8})" />

<style>
    path {
        pointer-events: none;
        stroke: color-mix(in oklab, var(--lane, var(--graph-edge)) var(--graph-wire-tint), var(--graph-edge));
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    foreignObject> :global(*) {
        height: 100%;
    }

    .backdrop {
        width: 100%;
        height: 100%;
    }

    path.target { stroke: var(--text-strong); stroke-width: 2; }
    .backdrop.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
    }

    @media (forced-colors: active) { path { stroke: GrayText; } }
</style>
