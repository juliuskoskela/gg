<script lang="ts">
    import type { RevChange } from "../messages/RevChange";
    import PanelTools from "../controls/PanelTools.svelte";
    import DiffDisplayOptions from "./DiffDisplayOptions.svelte";

    export let changes: RevChange[];
    export let title = "";

    $: insertions = changes.reduce((total, change) => total + (change.stat?.added ?? change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("+")).length, 0)), 0);
    $: deletions = changes.reduce((total, change) => total + (change.stat?.removed ?? change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("-")).length, 0)), 0);
</script>

<PanelTools label="Diff tools">
    <svelte:fragment slot="summary">
    <div class="changes-summary">
        {#if title}<h3>{title}</h3>{/if}
        <span class="file-count">{changes.length} {changes.length === 1 ? "file" : "files"}</span>
        <span class="diff-stat">{#if insertions}<span class="added">+{insertions}</span>{/if}{#if deletions}<span class="removed">−{deletions}</span>{/if}</span>
    </div>
    </svelte:fragment>
    {#if changes.length}<DiffDisplayOptions />{/if}
</PanelTools>

<style>
    .changes-summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--panel-gap); min-width: 0; }
    h3 { margin: 0; font-size: var(--type-ui); font-weight: 500; }
    .file-count { font-size: var(--type-caption); color: var(--muted); white-space: nowrap; }
    .diff-stat { display: flex; gap: var(--panel-gap); font-size: var(--type-caption); font-variant-numeric: tabular-nums; }
    .added { color: var(--positive); }
    .removed { color: var(--negative); }
</style>
