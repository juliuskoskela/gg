<script module lang="ts">
    const fileFilters = new Map<string, string>();
</script>

<script lang="ts">
    import { groupFiles } from "./fileCategories";
    import { untrack } from "svelte";

    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import { tick } from "svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import VirtualFileList from "./VirtualFileList.svelte";
    import TextField from "../controls/TextField.svelte";
    import PanelHeader from "../controls/PanelHeader.svelte";
    import FileTree from "../FileTree.svelte";
    import { navigateOptions } from "../controls/optionNavigation";
    interface Props {
        changes: RevChange[];
        headers: RevHeader[];
        selectedPath: string;
        reviewKey: string;
        visible: boolean;
        overlay: boolean;
        showHeading?: boolean;
        /** render the filter and grouping tools in place rather than in the panel toolbar */
        inline?: boolean;
        id?: string;
        onSelect: (change: RevChange) => void;
        onClose?: (() => void) | null;
    }

    let {
        changes,
        headers,
        selectedPath,
        reviewKey,
        visible,
        overlay,
        showHeading = true,
        inline = false,
        id = "changed-files",
        onSelect,
        onClose = null
    }: Props = $props();
    let panel!: HTMLElement;
    let searchInput: HTMLInputElement | undefined = $state();
    let search = $state("");
    let groupByType = $state(false);
    let lastKey = $state("");
    let wasVisible = $state(false);
    $effect.pre(() => {
        let nextKey = reviewKey;
        untrack(() => {
            if (nextKey !== lastKey) {
                if (lastKey) fileFilters.set(lastKey, search);
                search = fileFilters.get(nextKey) ?? "";
                lastKey = nextKey;
            }
        });
    });
    $effect.pre(() => { if (reviewKey) fileFilters.set(reviewKey, search); });
    let filteredChanges = $derived(changes.filter(change => change.path.relative_path.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
    let groups = $derived(groupFiles(filteredChanges));
    let visibleChanges = $derived(groupByType ? groups.flatMap(group => group.changes) : filteredChanges);
    $effect.pre(() => {
        let showing = visible, floating = overlay;
        untrack(() => {
            if (showing !== wasVisible) {
                wasVisible = showing;
                if (showing && floating) tick().then(() => { if (visible) searchInput?.focus(); });
            }
        });
    });
    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape" && overlay && visible && onClose && panel?.contains(event.target as Node)) { event.preventDefault(); onClose(); }
    }
</script>

<svelte:window onkeydown={keydown} />
<aside class="file-tree" class:overlay hidden={!visible} {id} aria-label="Changed files" bind:this={panel}>
    {#if showHeading}<PanelHeader><div class="file-tree-heading">Files <span>{changes.length}</span>{#if onClose}<div class="tree-toggle"><ToggleTray label="Changed files"><ToggleItem kind="disclosure" on text="Tree" label="File tree" tip="Hide file tree" controls="changed-files" onClick={onClose} /></ToggleTray></div>{/if}</div></PanelHeader>{/if}
    {#snippet tools()}<div class="file-filter toolbar-lead"><TextField className="file-search" type="search" label="Filter changed files" placeholder="Find a file…" bind:element={searchInput} bind:value={search} /></div><ToggleTray label="File grouping"><ToggleItem on={groupByType} label="Group by type" text="Group by type" onClick={() => groupByType = !groupByType} /></ToggleTray>{/snippet}
    {#if inline}<div class="inline-tools" role="group" aria-label="Files tools">{@render tools()}</div>
    {:else}<ViewToolbar label="Files tools" local={showHeading}>{@render tools()}</ViewToolbar>{/if}
    {#if changes.length > 200}<VirtualFileList changes={visibleChanges} {headers} {selectedPath} {onSelect} />{#if !filteredChanges.length}<p class="no-results">No matching files</p>{/if}{:else}
    <div class="tree-scroll" role="listbox" aria-label="Changed files" tabindex="-1" onkeydown={navigateOptions}>{#if groupByType}{#each groups as group (group.value)}<section aria-label={group.label}><h3 class="category-heading">{group.label}<span>{group.changes.length}</span></h3><FileTree changes={group.changes} {headers} {selectedPath} {onSelect} /></section>{/each}{:else}<FileTree changes={filteredChanges} {headers} {selectedPath} {onSelect} />{/if}{#if !filteredChanges.length}<p class="no-results">{changes.length ? "No matching files" : "No changed files"}</p>{/if}</div>{/if}
</aside>

<style>
    .file-tree { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; padding: 0; background: var(--surface); }
    .file-tree[hidden] { display: none; }
    .inline-tools { display: flex; align-items: center; justify-content: space-between; gap: var(--panel-gap); flex: none; min-width: 0; padding: var(--space-2) var(--pane-inset) 0; pointer-events: auto; --control-height: var(--panel-control-size); --input-surface: var(--surface); }
    .file-filter { flex: 1; min-width: 120px; max-width: 360px; }
    .file-filter :global(.file-search) { width: 100%; }
    .file-tree.overlay { position: absolute; inset-block: 0; inset-inline-end: 0; z-index: 3; width: min(280px, calc(100% - 44px)); border-inline-start: 1px solid var(--rule); box-shadow: var(--shadow-overlay); }
    /* same height as the description row so the tree toggle stays on one line as it moves */
    .file-tree-heading { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 27px; color: var(--text); font: var(--font-body); }
    .file-tree-heading span { color: var(--muted); font: var(--font-label); }
    .tree-toggle { display: flex; margin-inline-start: auto; }
    .tree-scroll { padding: 0 var(--panel-inset) 8px; flex: 1; overflow: auto; overscroll-behavior: contain; min-height: 0; pointer-events: auto; }
    .category-heading { display: flex; gap: var(--space-2); margin: var(--space-3) 0 var(--space-1); color: var(--muted); font: var(--font-label); }
    .no-results { margin: 8px 4px; color: var(--muted); font: var(--font-body); }
    @media (pointer: coarse), (max-width: 600px) { .file-tree :global(.file-search) { min-height: 44px; } }
</style>
