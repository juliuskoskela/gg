<script context="module" lang="ts">
    const fileFilters = new Map<string, string>();
</script>

<script lang="ts">
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
    export let changes: RevChange[];
    export let headers: RevHeader[];
    export let selectedPath: string;
    export let reviewKey: string;
    export let visible: boolean;
    export let overlay: boolean;
    export let showHeading = true;
    export let onSelect: (change: RevChange) => void;
    export let onClose: (() => void) | null = null;
    let panel: HTMLElement;
    let searchInput: HTMLInputElement;
    let search = "";
    let lastKey = "";
    let wasVisible = false;
    $: if (reviewKey !== lastKey) {
        if (lastKey) fileFilters.set(lastKey, search);
        search = fileFilters.get(reviewKey) ?? "";
        lastKey = reviewKey;
    }
    $: if (reviewKey) fileFilters.set(reviewKey, search);
    $: filteredChanges = changes.filter(change => change.path.relative_path.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    $: if (visible !== wasVisible) {
        wasVisible = visible;
        if (visible && overlay) tick().then(() => { if (visible) searchInput?.focus(); });
    }
    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape" && overlay && visible && onClose && panel?.contains(event.target as Node)) { event.preventDefault(); onClose(); }
    }
</script>

<svelte:window on:keydown={keydown} />
<aside class="file-tree" class:overlay hidden={!visible} id="changed-files" aria-label="Changed files" bind:this={panel}>
    {#if showHeading}<PanelHeader><div class="file-tree-heading">Files <span>{changes.length}</span>{#if onClose}<div class="tree-toggle"><ToggleTray label="Changed files"><ToggleItem kind="disclosure" on text="Tree" label="File tree" tip="Hide file tree" controls="changed-files" onClick={onClose} /></ToggleTray></div>{/if}</div></PanelHeader>{/if}
    <TextField className="file-search" type="search" label="Filter changed files" placeholder="Find a file…" bind:element={searchInput} bind:value={search} />
    {#if changes.length > 200}<VirtualFileList changes={filteredChanges} {headers} {selectedPath} {onSelect} />{#if !filteredChanges.length}<p class="no-results">No matching files</p>{/if}{:else}
    <div class="tree-scroll" role="listbox" aria-label="Changed files" tabindex="-1" on:keydown={navigateOptions}><FileTree changes={filteredChanges} {headers} {selectedPath} {onSelect} />{#if !filteredChanges.length}<p class="no-results">{changes.length ? "No matching files" : "No changed files"}</p>{/if}</div>{/if}
</aside>

<style>
    .file-tree { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; padding: 0; background: var(--surface); }
    .file-tree[hidden] { display: none; }
    .file-tree > :global(.file-search:first-child) { margin-block-start: 8px; }
    .file-tree.overlay { position: absolute; inset-block: 0; inset-inline-end: 0; z-index: 3; width: min(280px, calc(100% - 44px)); border-inline-start: 1px solid var(--rule); box-shadow: var(--shadow-overlay); }
    /* same height as the description row so the tree toggle stays on one line as it moves */
    .file-tree-heading { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 27px; color: var(--text); font-size: var(--type-ui); }
    .file-tree-heading span { font-size: var(--type-caption); color: var(--muted); }
    .tree-toggle { display: flex; margin-inline-start: auto; }
    .file-tree :global(.file-search) { margin-inline: var(--panel-inset); width: calc(100% - 2 * var(--panel-inset)); min-width: 0; }
    .tree-scroll { padding: 0 var(--panel-inset) 8px; flex: 1; overflow: auto; overscroll-behavior: contain; min-height: 0; pointer-events: auto; }
    .no-results { margin: 8px 4px; font-size: var(--type-ui); color: var(--muted); }
    @media (pointer: coarse), (max-width: 600px) { .file-tree :global(.file-search) { min-height: 44px; } }
</style>
