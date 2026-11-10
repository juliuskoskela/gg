<script module lang="ts">
    let fileFilters = new Map<string, string>();
</script>

<script lang="ts">
    import { untrack } from "svelte";
    import TextField from "../controls/TextField.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import ChangeObject from "../objects/ChangeObject.svelte";
    import FileTreeView from "../tree/FileTreeView.svelte";
    import PaneBar from "../tree/PaneBar.svelte";

    // the diff's changed files: the shared tree over the paths of the changes, each file a draggable change object
    interface Props {
        changes: RevChange[];
        headers: RevHeader[];
        selectedPath: string;
        /** the filter is remembered for each revision */
        reviewKey: string;
        id?: string;
        onSelect: (change: RevChange) => void;
    }

    let { changes, headers, selectedPath, reviewKey, id = "changed-files-list", onSelect }: Props = $props();
    let filter = $state("");
    let groupByType = $state(false);
    let lastKey = $state("");
    $effect.pre(() => {
        let nextKey = reviewKey;
        untrack(() => {
            if (nextKey !== lastKey) {
                if (lastKey) fileFilters.set(lastKey, filter);
                filter = fileFilters.get(nextKey) ?? "";
                lastKey = nextKey;
            }
        });
    });
    $effect.pre(() => { if (reviewKey) fileFilters.set(reviewKey, filter); });
</script>

<aside class="changed-files-list" {id} aria-label="Changed files">
    <PaneBar label="Files tools">
        <div class="bar-field"><TextField className="file-search" type="search" label="Filter changed files" placeholder="Find a file…" bind:value={filter} /></div>
        <ToggleTray label="File grouping"><ToggleItem on={groupByType} label="Group by type" text="Group by type" onClick={() => groupByType = !groupByType} /></ToggleTray>
    </PaneBar>
    <FileTreeView {changes} {selectedPath} bind:filter {groupByType} label="Changed files" memoryKey={reviewKey} seedKey={reviewKey} empty={changes.length ? "No matching files" : "No changed files"} {onSelect}>
        {#snippet fileRow({ row, selected, tabindex, size, index, activate })}
            {#if row.change}<ChangeObject tree {row} {headers} change={row.change} {selected} tabIndex={tabindex} setSize={size} position={index + 1} onSelected={activate} />{/if}
        {/snippet}
    </FileTreeView>
</aside>

<style>
    .changed-files-list { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface); }
</style>
