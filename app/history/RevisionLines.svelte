<script lang="ts">
    import type { HistoryRevision } from "../messages/HistoryRevision";
    import Icon from "../controls/Icon.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import { navigationIndex, visibleItems } from "../controls/listNavigation";
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

    // lanes sit 12px apart; a node's centre is half a lane plus a margin from the gutter's edge
    let lane = 12, margin = 4;
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
        return { positions, links, width: columns * lane + 2 * margin };
    }
    let graph = $derived(layout(revisions));
    let centre = (column: number) => column * lane + lane / 2 + margin;

    function navigate(event: KeyboardEvent) {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        let buttons = visibleItems((event.currentTarget as HTMLElement).closest<HTMLElement>(".revision-lines")!, "button[data-revision-row]");
        let index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
        event.preventDefault();
        // focus only: selecting a revision opens its patch and would replace this list
        buttons[navigationIndex(event.key, index, buttons.length)!]?.focus();
    }
</script>

<div class="revision-lines" role="list" aria-label="Revisions" style="--graph-width: {graph.width}px; --rows: {revisions.length}">
    <!-- y is measured in rows so the wires follow the row height; strokes stay one pixel -->
    <svg class="wires" width={graph.width} viewBox="0 0 {graph.width} {revisions.length}" preserveAspectRatio="none" aria-hidden="true">
        {#each graph.links as link}
            {@const x1 = centre(link.from.column)}
            {@const y1 = link.from.row + 0.5}
            {@const x2 = centre(link.to!.column)}
            {@const y2 = link.to!.row + 0.5}
            <path d="M{x1},{y1} C{x1},{y1 + 1} {x2},{y2 - 1} {x2},{y2}" />
        {/each}
    </svg>
    {#each revisions as revision}
        {@const id = revision.id.commit.hex}
        {@const position = graph.positions.get(id)!}
        {@const subject = revision.description.lines[0]}
        <div class="revision-row" role="listitem">
            <button type="button" data-revision-row aria-pressed={selected === id} onclick={() => onSelect(revision)} onkeydown={navigate}>
                <IdSpan id={revision.id.change} />
                <span class="subject" class:empty={!subject}>{subject || "(no description set)"}</span>
                {#if revision.has_conflict}<span class="conflict" role="img" aria-label="Has conflicts" title="Has conflicts"><Icon name="alert-triangle" /></span>{/if}
                <span class="commit"><IdSpan id={revision.id.commit} /></span>
            </button>
            <span class="node" class:head={heads.includes(id)} class:selected={selected === id} style="--lane: var(--lane-{position.column % 8}); left: {centre(position.column)}px"></span>
        </div>
    {/each}
</div>

<style>
    .revision-lines { position: relative; min-width: 0; }
    .wires { position: absolute; inset-block: 0; inset-inline-start: 0; height: calc(var(--rows) * var(--file-row-height)); pointer-events: none; }
    .wires path { fill: none; stroke: var(--graph-edge); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .revision-row { position: relative; height: var(--file-row-height); }
    button { display: flex; align-items: center; gap: var(--space-2); width: 100%; height: 100%; min-width: 0; padding: 0 var(--space-2) 0 calc(var(--graph-width) + var(--space-1)); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; white-space: nowrap; cursor: pointer; }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    button[aria-pressed="true"] { background: var(--selection-bg); }
    @media (hover: hover) { button[aria-pressed="false"]:hover { background: var(--interaction-hover); } }
    .subject { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .subject.empty { color: var(--muted); }
    button[aria-pressed="true"] .subject:not(.empty) { color: var(--text-strong); }
    .conflict { display: inline-flex; flex: none; color: var(--negative); }
    .commit { flex: none; color: var(--muted); font: var(--font-id); }
    /* faint lane colour at rest, the full lane colour when selected */
    .node { position: absolute; top: 50%; width: 6px; height: 6px; border-radius: 50%; background: color-mix(in srgb, var(--lane) 55%, var(--muted)); transform: translate(-50%, -50%); pointer-events: none; }
    .node.head { width: 7px; height: 7px; }
    .node.selected { background: var(--lane); }
</style>
