<script lang="ts">
    import { floating } from "../controls/floating";
    import { diffStyle, diffWrap } from "../stores";
    import Icon from "../controls/Icon.svelte";
    export let compact = false;
    let menu: HTMLDetailsElement;
    let open = false;
</script>

<svelte:window on:pointerdown={event => { if (open && menu && !menu.contains(event.target as Node)) open = false; }} on:keydown={event => { if (event.key === "Escape" && open) { open = false; menu.querySelector("summary")?.focus(); } }} />

<div class="display-options">
    {#if compact}
        <details class="display-menu" bind:this={menu} bind:open>
            <summary aria-label="Diff display options" title="Diff display options"><Icon name="sliders" /></summary>
            <div class="display-popover" use:floating={{ open, anchor: menu }}><label for="compact-diff-layout">Diff layout</label><select id="compact-diff-layout" aria-label="Diff layout" bind:value={$diffStyle}><button type="button" class="select-trigger"><selectedcontent></selectedcontent></button><option value="auto">Auto layout</option><option value="split">Side by side</option><option value="unified">Unified</option></select><label class="wrap-option"><input type="checkbox" bind:checked={$diffWrap} />Wrap lines</label></div>
        </details>
    {:else}
        <select aria-label="Diff layout" bind:value={$diffStyle}><button type="button" class="select-trigger"><selectedcontent></selectedcontent></button><option value="auto">Auto layout</option><option value="split">Side by side</option><option value="unified">Unified</option></select><button type="button" aria-label="Wrap diff lines" title="Wrap diff lines" aria-pressed={$diffWrap} on:click={() => diffWrap.update(value => !value)}><Icon name="corner-down-left" /></button>
    {/if}
</div>

<style>
    .display-options { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    select { font-size: var(--type-ui); padding: 5px var(--control-padding-inline); max-width: 130px; }
    button:not(.select-trigger), summary { display: grid; place-items: center; min-width: 32px; min-height: 32px; padding: 5px var(--control-padding-inline); border: 0; border-radius: var(--radius-control); color: var(--text); background: transparent; cursor: pointer; }
    button:not(.select-trigger)[aria-pressed="true"] { background: var(--selection-bg); color: var(--selection-text); }
    .display-menu { position: relative; pointer-events: auto; }
    summary { list-style: none; }
    summary::-webkit-details-marker { display: none; }
    .display-popover { position: fixed; max-height: calc(100dvh - 24px); overflow: auto; z-index: 60; display: grid; gap: 8px; width: 200px; max-width: calc(100vw - 24px); padding: 12px; background: var(--raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-overlay); pointer-events: auto; }
    .display-popover label { color: var(--muted); font-size: var(--type-ui); }
    .display-popover select { max-width: none; width: 100%; }
    .wrap-option { display: flex; align-items: center; gap: 8px; min-height: 32px; }
    @media (hover: hover) { button:not(.select-trigger):hover, summary:hover { background: var(--hover); color: var(--text); } button[aria-pressed="true"]:hover { background: var(--selection-hover); } }
    button:not(.select-trigger):active, summary:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { select { font-size: var(--type-ui); } button:not(.select-trigger), summary, select, .wrap-option { min-height: 44px; min-width: 44px; } }
</style>
