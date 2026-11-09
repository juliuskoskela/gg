<script lang="ts">
    import type { HistoryRevision } from "../messages/HistoryRevision";
    interface Props {
        revisions: HistoryRevision[];
        selected?: string;
        heads?: string[];
        onSelect: (revision: HistoryRevision) => void;
    }

    let {
        revisions,
        selected = "",
        heads = [],
        onSelect
    }: Props = $props();
    function layout(revisions: HistoryRevision[]) {
        let lanes: (string | null)[] = [];
        let positions = new Map<string, { column: number; row: number }>();
        let columns = 1;
        for (let [row, revision] of revisions.entries()) {
            let id = revision.id.commit.hex;
            let column = lanes.indexOf(id);
            if (column < 0) { column = lanes.indexOf(null); if (column < 0) column = lanes.length; }
            positions.set(id, { column, row }); lanes[column] = null;
            for (let parent of revision.parent_ids) {
                if (lanes.includes(parent)) continue;
                let slot = lanes[column] === null ? column : lanes.indexOf(null);
                if (slot < 0) slot = lanes.length;
                lanes[slot] = parent;
            }
            columns = Math.max(columns, lanes.length);
        }
        let links = revisions.flatMap(revision => revision.parent_ids.map(parent => ({ from: positions.get(revision.id.commit.hex)!, to: positions.get(parent) })).filter(link => !!link.to));
        return { positions, links, width: columns * 14 + 16 };
    }
    let graph = $derived(layout(revisions));
</script>

<div class="snapshot-graph" style={`--graph-width: ${graph.width}px`}>
    <svg class="ancestry" width={graph.width} height={revisions.length * 48} aria-hidden="true">
        {#each graph.links as link}
            <path d={`M${link.from.column * 14 + 10},${link.from.row * 48 + 24} C${link.from.column * 14 + 10},${link.from.row * 48 + 48} ${link.to!.column * 14 + 10},${link.to!.row * 48} ${link.to!.column * 14 + 10},${link.to!.row * 48 + 24}`} />
        {/each}
        {#each revisions as revision}
            {@const position = graph.positions.get(revision.id.commit.hex)!}
            <circle cx={position.column * 14 + 10} cy={position.row * 48 + 24} r={heads.includes(revision.id.commit.hex) ? 3 : 2} class:selected={selected === revision.id.commit.hex} />
        {/each}
    </svg>
    <div class="snapshot-revisions">{#each revisions as revision}<button class="snapshot-row" type="button" aria-pressed={selected === revision.id.commit.hex} onclick={() => onSelect(revision)}><span>{revision.description.lines[0] || "No description set"}</span><small>{revision.id.change.hex.slice(0, 8)} · {revision.id.commit.hex.slice(0, 8)}{#if revision.has_conflict} · Conflict{/if}</small></button>{/each}</div>
</div>

<style>
    .snapshot-graph { position: relative; display: grid; grid-template-columns: var(--graph-width) minmax(0, 1fr); min-width: 0; }
    .ancestry { grid-column: 1; grid-row: 1; max-width: 100%; }
    path { fill: none; stroke: color-mix(in srgb, var(--text) 16%, transparent); stroke-width: 1; }
    circle { fill: var(--muted); }
    circle.selected { fill: var(--text); }
    .snapshot-revisions { grid-column: 2; grid-row: 1; min-width: 0; }
    .snapshot-row { width: 100%; height: 48px; padding: 5px 8px; display: flex; flex-direction: column; justify-content: center; gap: 3px; text-align: start; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); cursor: pointer; }
    .snapshot-row span { display: block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    small { color: var(--muted); font-size: var(--type-caption); }
    .snapshot-row[aria-pressed="true"] { background: var(--interaction-selected); }
    .snapshot-row[aria-pressed="true"] small { color: var(--text); }
    @media (hover: hover) { .snapshot-row:hover { background: var(--interaction-hover); } .snapshot-row[aria-pressed="true"]:hover { background: var(--interaction-selected-hover); } }
</style>
