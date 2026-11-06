<script lang="ts">
    import { tick } from "svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import ChangeObject from "../objects/ChangeObject.svelte";
    export let changes: RevChange[];
    export let headers: RevHeader[];
    export let selectedPath: string;
    export let onSelect: (change: RevChange) => void;
    let viewport: HTMLElement;
    let height = 440;
    let top = 0;
    let previousChanges: RevChange[];
    let rowHeight = 24;
    $: if (changes !== previousChanges) { previousChanges = changes; top = 0; if (viewport) viewport.scrollTop = 0; }
    $: start = Math.max(0, Math.floor(top / rowHeight) - 4);
    $: end = Math.min(changes.length, start + Math.ceil(height / rowHeight) + 8);
    async function navigate(event: KeyboardEvent) {
        let item = (event.target as HTMLElement).closest<HTMLElement>('[data-file-index]');
        if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
        let index = Number(item.dataset.fileIndex);
        if (event.key === "ArrowDown") index++;
        else if (event.key === "ArrowUp") index--;
        else if (event.key === "Home") index = 0;
        else if (event.key === "End") index = changes.length - 1;
        else return;
        event.preventDefault();
        index = Math.max(0, Math.min(changes.length - 1, index));
        let y = index * rowHeight;
        if (y < top) top = y;
        else if (y + rowHeight > top + height) top = y + rowHeight - height;
        viewport.scrollTop = top;
        await tick();
        viewport.querySelector<HTMLElement>(`[data-file-index="${index}"] button`)?.focus({ preventScroll: true });
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys move focus between file options) -->
<div class="virtual-files" role="listbox" tabindex="-1" aria-label="Changed files" bind:this={viewport} bind:clientHeight={height} on:scroll={event => top = event.currentTarget.scrollTop} on:keydown={navigate}>
    <div class="row-measure" aria-hidden="true" bind:clientHeight={rowHeight}></div>
    <div class="file-space" style:height={`${changes.length * rowHeight}px`}>
        {#each changes.slice(start, end) as change, i (change.path.repo_path)}
            <div class="file-row" data-file-index={start + i} style:top={`${(start + i) * rowHeight}px`} style:height={`${rowHeight}px`}>
                <ChangeObject tree compactPath setSize={changes.length} position={start + i + 1} {change} {headers} selected={selectedPath === change.path.repo_path} onSelected={() => onSelect(change)} />
            </div>
        {/each}
    </div>
</div>

<style>
    .virtual-files { position: relative; flex: 1; margin-inline: var(--panel-inset); min-height: 0; overflow: auto; overscroll-behavior: contain; pointer-events: auto; }
    .file-space { position: relative; }
    .row-measure { position: absolute; width: 1px; height: var(--file-row-height); visibility: hidden; pointer-events: none; }
    .file-row { position: absolute; inset-inline: 0; }
    .file-row :global(.layout) { height: var(--file-row-height); min-height: var(--file-row-height); }
</style>
