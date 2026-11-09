<script lang="ts">
    import { navigationIndex, revealRow, virtualRange } from "../controls/listNavigation";
    import { untrack } from "svelte";

    import { tick } from "svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import ChangeObject from "../objects/ChangeObject.svelte";
    interface Props {
        changes: RevChange[];
        headers: RevHeader[];
        selectedPath: string;
        onSelect: (change: RevChange) => void;
    }

    let {
        changes,
        headers,
        selectedPath,
        onSelect
    }: Props = $props();
    let viewport = $state<HTMLElement>();
    let height = $state(440);
    let top = $state(0);
    let previousChanges: RevChange[] | undefined;
    let rowHeight = $state(24);
    $effect.pre(() => {
        let files = changes;
        untrack(() => {
            if (files !== previousChanges) { previousChanges = files; top = 0; if (viewport) viewport.scrollTop = 0; }
        });
    });
    let range = $derived(virtualRange(top, height, rowHeight, 4, 4));
    let start = $derived(range.start);
    let end = $derived(Math.min(changes.length, range.end));
    async function navigate(event: KeyboardEvent) {
        let item = (event.target as HTMLElement).closest<HTMLElement>('[data-file-index]');
        if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        let index = navigationIndex(event.key, Number(item.dataset.fileIndex), changes.length);
        if (index === null) return;
        event.preventDefault();
        top = revealRow(top, height, rowHeight, index);
        if (viewport) viewport.scrollTop = top;
        await tick();
        viewport?.querySelector<HTMLElement>(`[data-file-index="${index}"] button`)?.focus({ preventScroll: true });
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys move focus between file options) -->
<div class="virtual-files" role="listbox" tabindex="-1" aria-label="Changed files" bind:this={viewport} bind:clientHeight={height} onscroll={event => top = event.currentTarget.scrollTop} onkeydown={navigate}>
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
