<script lang="ts">
    import { tick } from "svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import Icon from "../controls/Icon.svelte";
    import VirtualFileList from "./VirtualFileList.svelte";
    import FileTree from "../FileTree.svelte";
    import { navigateOptions } from "../controls/optionNavigation";
    export let changes: RevChange[];
    export let headers: RevHeader[];
    export let selectedPath: string;
    export let reviewKey: string;
    export let visible: boolean;
    export let overlay: boolean;
    export let onSelect: (change: RevChange) => void;
    export let onClose: () => void;
    let panel: HTMLElement;
    let searchInput: HTMLInputElement;
    let search = "";
    let lastKey = "";
    let wasVisible = false;
    $: if (reviewKey !== lastKey) { search = ""; lastKey = reviewKey; }
    $: filteredChanges = changes.filter(change => change.path.relative_path.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    $: if (visible !== wasVisible) {
        wasVisible = visible;
        if (visible && overlay) tick().then(() => { if (visible) searchInput?.focus(); });
    }
    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape" && overlay && visible && panel?.contains(event.target as Node)) { event.preventDefault(); onClose(); }
    }
</script>

<svelte:window on:keydown={keydown} />
<aside class="file-tree" class:overlay hidden={!visible} id="changed-files" aria-label="Changed files" bind:this={panel}>
    <div class="file-tree-heading">Files <span>{changes.length}</span>{#if overlay}<button type="button" aria-label="Close file navigator" on:click={onClose}><Icon name="x" /></button>{/if}</div>
    <input class="file-search" type="search" aria-label="Filter changed files" placeholder="Find a file…" bind:this={searchInput} bind:value={search} />
    {#if changes.length > 200}<VirtualFileList changes={filteredChanges} {headers} {selectedPath} {onSelect} />{#if !filteredChanges.length}<p class="no-results">No matching files</p>{/if}{:else}
    <div class="tree-scroll" role="listbox" aria-label="Changed files" tabindex="-1" on:keydown={navigateOptions}><FileTree changes={filteredChanges} {headers} {selectedPath} {onSelect} />{#if !filteredChanges.length}<p class="no-results">{changes.length ? "No matching files" : "No changed files"}</p>{/if}</div>{/if}
</aside>

<style>
    .file-tree { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; padding: 8px; background: var(--surface); }
    .file-tree[hidden] { display: none; }
    .file-tree.overlay { position: absolute; inset-block: 0; inset-inline-end: 0; z-index: 3; width: min(280px, calc(100% - 44px)); border-inline-start: 1px solid var(--rule); box-shadow: var(--shadow-overlay); }
    .file-tree-heading { display: flex; align-items: center; gap: 8px; min-height: 24px; padding-inline: 4px; color: var(--text); font-size: var(--type-ui); }
    .file-tree-heading span { font-size: var(--type-caption); color: var(--muted); }
    .file-tree-heading button { margin-inline-start: auto; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--text); cursor: pointer; }
    .file-search { width: 100%; min-width: 0; }
    .tree-scroll { flex: 1; overflow: auto; overscroll-behavior: contain; min-height: 0; pointer-events: auto; }
    .no-results { margin: 8px 4px; font-size: var(--type-ui); color: var(--muted); }
    @media (pointer: coarse), (max-width: 600px) { .file-search { min-height: 44px; } }
</style>
