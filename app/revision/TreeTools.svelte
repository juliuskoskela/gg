<script lang="ts">
    import type { Snippet } from "svelte";
    import TextField from "../controls/TextField.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import type { treeSummary } from "./repositoryTree";

    interface Props {
        filter: string;
        changedOnly: boolean;
        summary: ReturnType<typeof treeSummary> | null;
        /** the files view puts the filter in the tree pane's own bar */
        filterField?: boolean;
        /** off where the filters make no sense, such as on the editor page of a narrow view; the extra toggles remain */
        filters?: boolean;
        trayLabel?: string;
        /** more independent toggles, grouped with the changed-only one */
        children?: Snippet;
    }

    let { filter = $bindable(), changedOnly = $bindable(), summary, filterField = true, filters = true, trayLabel = "File filter", children }: Props = $props();
    let formatter = new Intl.NumberFormat();
</script>

{#if filterField}<div class="tree-filter toolbar-lead"><TextField className="tree-search" type="search" label="Filter files" placeholder="Find a file…" bind:value={filter} /></div>{/if}
{#if filters && summary}
    <div class="tree-summary toolbar-lead"><span>{formatter.format(summary.files)} {summary.files === 1 ? "file" : "files"}</span><span>{formatter.format(summary.changed)} changed</span></div>
{/if}
<ToggleTray label={trayLabel} mode="multi">
    {#if filters}<ToggleItem icon="filter" on={changedOnly} label="Show changed files only" onClick={() => changedOnly = !changedOnly} />{/if}
    {@render children?.()}
</ToggleTray>

<style>
    .tree-filter { flex: 1; min-width: 120px; max-width: 360px; }
    .tree-filter :global(.tree-search) { width: 100%; }
    .tree-summary { display: flex; gap: var(--space-2); white-space: nowrap; }
    .tree-summary span { color: var(--muted); font: var(--font-label); }
    @media (pointer: coarse), (max-width: 600px) { .tree-filter :global(.tree-search) { min-height: 44px; } }
</style>
