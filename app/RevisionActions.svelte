<script lang="ts">
    import type { RevHeader } from "./messages/RevHeader";
    import { currentMutation, ignoreToggled, revisionSelectEvent } from "./stores";
    import { revisionCommands } from "./commands/registry";
    import Icon from "./controls/Icon.svelte";
    export let headers: RevHeader[];
    export let hasChanges = false;
    export let compact = false;
    let menuOpen = false;
    let root: HTMLDivElement;
    let moreButton: HTMLButtonElement;
    $: commands = revisionCommands(headers, true, $currentMutation, $ignoreToggled, $revisionSelectEvent, hasChanges, compact);
    $: selectionKey = headers.map(header => header.id.commit.hex).join(",");
    let previousSelection = "";
    $: if (selectionKey !== previousSelection) { menuOpen = false; previousSelection = selectionKey; }
</script>
<svelte:window on:pointerdown={event => { if (menuOpen && !root.contains(event.target as Node)) menuOpen = false; }} on:keydown={event => { if (event.key === "Escape" && menuOpen) { menuOpen = false; moreButton.focus(); } }} />
<div class="revision-actions" role="group" aria-label="Revision actions" bind:this={root}>
    <button class="more-button" type="button" aria-label="Revision actions" aria-expanded={menuOpen} bind:this={moreButton} on:click={() => menuOpen = !menuOpen}><Icon name="more-horizontal" /></button>
    {#if menuOpen}<div class="action-menu" role="group" aria-label="Revision actions menu">
        {#each commands as command (command.id)}
            <button type="button" disabled={!!command.reason} title={command.reason ?? command.label} on:click={() => { menuOpen = false; command.execute(); }}><Icon name={command.icon} /> {command.label}{#if command.reason}<small>{command.reason}</small>{/if}</button>
        {/each}
    </div>{/if}
</div>
<style>
    .revision-actions { position: relative; width: fit-content; max-width: 100%; display: flex; align-items: center; gap: 2px; min-width: 0; flex-wrap: wrap; pointer-events: auto; }
    .revision-actions :global(button) { font-size: var(--type-ui); max-width: 100%; height: auto; white-space: normal; overflow-wrap: anywhere; }
    .more-button { display: grid; place-items: center; width: 32px; min-height: 32px; padding: 5px var(--control-padding-inline); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); cursor: pointer; }
    .action-menu { position: absolute; z-index: 70; inset-block-start: calc(100% + 6px); inset-inline-end: 0; display: grid; gap: 4px; width: min(240px, calc(100vw - 24px)); max-height: 60dvh; overflow: auto; overscroll-behavior: contain; padding: 6px; background: var(--raised); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); pointer-events: auto; }
    .action-menu button { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; padding: 8px; background: transparent; color: var(--text); }
    .action-menu button:disabled { color: var(--text-disabled); }
    .action-menu small { display: block; color: var(--muted); }
    @media (hover: hover) { .more-button:hover { background: var(--hover); color: var(--text); } }
    .more-button:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .more-button { min-width: 44px; min-height: 44px; } }
    @media (max-width: 600px) {
        .revision-actions { width: 100%; justify-content: space-between; gap: 0; }
        .revision-actions :global(button) { padding-inline: 6px; font-size: var(--type-ui); gap: 4px; }
        .revision-actions :global(button svg) { width: var(--icon-size); height: var(--icon-size); }
    }
    @media (max-width: 380px) { .revision-actions :global(button:not(.more-button) svg) { display: none; } }
</style>
