<script lang="ts">
    import GraphNode from "../GraphNode.svelte";
    import RevisionObject from "../objects/RevisionObject.svelte";
    import { revisionFixture } from "./revisionFixture";

    let selected = 1;
    let names = ["Refine shared controls", "Keep recovery within reach", "Make revision history readable", "Align panel tools", "Preserve workspace context", "Unify file navigation", "Review changes in place", "Keep the graph quiet", "Current workspace", "Another workspace"];
    let rows = names.map((name, index) => ({
        ...revisionFixture.headers[0],
        id: {
            change: { ...revisionFixture.headers[0].id.change, hex: `q${index}mzylkloup`, prefix: `q${index}mz`, rest: "ylkloup" },
            commit: { ...revisionFixture.headers[0].id.commit, hex: `c${index}074ec511bb`, prefix: `c${index}074ec5`, rest: "11bb" },
        },
        description: { lines: [name] },
        refs: index === 0 ? revisionFixture.headers[0].refs.slice(0, 2) : index === 3 ? revisionFixture.headers[0].refs.filter(ref => ref.type === "Tag").slice(0, 1) : [],
        is_immutable: index === 7,
        is_working_copy: index >= 8,
        working_copy_of: index === 9 ? "review" : null,
    }));
</script>

<div class="history-colors" role="listbox" aria-label="History color specimens">
    {#each rows as header, lane}
        <div class="color-row" style="--lane: var(--lane-{lane % 8})">
            <svg width="18" height="28" aria-hidden="true"><GraphNode {header} {lane} /></svg>
            <RevisionObject {header} selected={lane === selected} onClick={() => selected = lane} />
        </div>
    {/each}
</div>

<style>
    .history-colors { padding: 8px; background: var(--surface); border: 1px solid var(--rule); }
    .color-row { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; }
</style>
