<!-- Renders commit rows with an SVG graph drawn over them, virtualising the ui to allow for long graphs -->

<script module lang="ts">
    export type { EnhancedLine, EnhancedRow } from "./graphRows";
</script>

<script lang="ts">
    import { revisionRowHeight } from "./graphLayout";
    import type { Snippet } from "svelte";
    import type { EnhancedLine, EnhancedRow } from "./graphRows";
    import GraphLine from "./GraphLine.svelte";
    import GraphNode from "./GraphNode.svelte";

    let columnWidth = 18;
    // rows reach this far left of their node, so the selection never clips a station's halo
    const rowBleed = 6;
    interface Props {
      rowHeight?: number;
      authorSpace?: number;
      containerHeight: number;
      endInset?: number;
      containerWidth: number;
      scrollTop: number;
      rows: (EnhancedRow | null)[];
      children?: Snippet<[{ row: EnhancedRow | null }]>;
    }

    let {
      rowHeight = revisionRowHeight,
      authorSpace = 0,
      containerHeight,
      endInset = 0,
      containerWidth,
      scrollTop,
      rows,
      children
    }: Props = $props();


    function sliceArray(arr: (EnhancedRow | null)[], start: number, end: number) {
        arr = arr.slice(start, end);

        let expectedLength = end - start;

        while (arr.length < expectedLength) {
            arr.push(null); // placeholders when there aren't enough items to fill the container
        }

        return arr;
    }

    function shiftArray(arr: (EnhancedRow | null)[], count: number) {
        for (let i = 0; i < count; i++) {
            arr.unshift(arr.pop()!);
        }
        return arr;
    }

    function sortLines(lines: EnhancedLine[]): EnhancedLine[] {
        return lines.sort((a, b) => {
            let aSameColumn = a.source[0] == a.target[0];
            let bSameColumn = b.source[0] == b.target[0];
            if (aSameColumn && !bSameColumn) {
                return -1;
            } else if (bSameColumn && !aSameColumn) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    function computeDistinctLines(rows: (EnhancedRow | null)[]): EnhancedLine[] {
        const keys = new Set<number>();
        const result: EnhancedLine[] = [];

        for (const row of rows) {
            if (row === null) continue;
            for (const line of row.passingLines) {
                if (!keys.has(line.key)) {
                    keys.add(line.key);
                    result.push(line);
                }
            }
        }

        return sortLines(result);
    }

    let graphHeight = $derived(Math.max(containerHeight, rows.length * rowHeight + endInset));
    let visibleRows = $derived(Math.ceil(containerHeight / rowHeight) + 1);
    let startIndex = $derived(Math.floor(Math.max(scrollTop, 0) / rowHeight));
    let endIndex = $derived(startIndex + visibleRows);
    let overlap = $derived(startIndex % visibleRows);
    let visibleSlice = $derived(shiftArray(sliceArray(rows, startIndex, endIndex), overlap));
    let distinctLines = $derived(computeDistinctLines(visibleSlice));
</script>

<svg class="graph" style="width: 100%; height: {graphHeight}px;">
  <g transform="translate({rowBleed} 0)">
    {#each visibleSlice as row, i (i)}
        <g transform="translate({(row?.location[0] ?? 0) * columnWidth} {(row?.location[1] ?? 0) * rowHeight})">
            <foreignObject
                class:placeholder={row === null}
                x={-rowBleed}
                height={rowHeight}
                width={containerWidth - (row?.location[0] ?? 0) * columnWidth}
                style="--leftpad: {(row?.padding ?? 0) * columnWidth + columnWidth + 6 + rowBleed}px; --lane: var(--lane-{(row?.location[0] ?? 0) % 8});">
                {@render children?.({ row, })}
            </foreignObject>
        </g>
    {/each}

    {#each distinctLines as line (line.key)}
        <GraphLine {line} {rowHeight} {authorSpace} />
    {/each}

    <!-- stations paint last so their halo sits over the lines -->
    {#each visibleSlice as row, i (i)}
        {#if row}
            <g transform="translate({row.location[0] * columnWidth} {row.location[1] * rowHeight})">
                <GraphNode header={row.revision} {rowHeight} {authorSpace} lane={row.location[0]} />
            </g>
        {/if}
    {/each}
  </g>
</svg>

<style>
    svg {
        overflow: hidden;
    }

    foreignObject {
        overflow: hidden;
        display: flex;
        align-items: stretch;
    }

    .placeholder {
        pointer-events: none;
    }
</style>
