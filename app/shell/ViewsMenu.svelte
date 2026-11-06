<script lang="ts">
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import type { PanelId } from "../workspace/dock";
    import { contains, dock } from "../workspace/dock";
    import { viewChoices } from "../workspace/panels";
    import { repoStatusEvent } from "../stores";

    let root: HTMLDivElement;
    let menuOpen = false;
    $: choices = viewChoices(!!$repoStatusEvent);

    onMount(() => {
        let openMenu = () => { menuOpen = true; };
        window.addEventListener("gg:open-views", openMenu);
        return () => window.removeEventListener("gg:open-views", openMenu);
    });

    async function toggle(id: PanelId) {
        if (contains(get(dock).root, id)) {
            dock.close(id);
            return;
        }
        dock.open(id);
        menuOpen = false;
        await tick();
        document.getElementById(`panel-tab-${id}`)?.focus();
    }
</script>

<svelte:window
    on:pointerdown={event => { if (menuOpen && !root.contains(event.target as Node)) menuOpen = false; }}
    on:keydown={event => { if (event.key === "Escape" && menuOpen) { event.preventDefault(); event.stopPropagation(); menuOpen = false; document.getElementById("views-menu")?.focus(); } }} />

<div class="views" bind:this={root}>
    <button id="views-menu" type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="views-menu-list" on:click={() => menuOpen = !menuOpen}>Views<svg class="chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
    {#if menuOpen}
        <div id="views-menu-list" class="views-menu" role="menu" aria-label="Views">
            {#each choices as choice (choice.id)}
                <button type="button" role="menuitemcheckbox" aria-checked={contains($dock.root, choice.id)} on:click={() => toggle(choice.id)}>{choice.label}</button>
            {/each}
            <button type="button" role="menuitem" on:click={() => dock.reset()}>Reset layout</button>
        </div>
    {/if}
</div>

<style>
    .views { position: relative; }
    #views-menu { display: inline-flex; align-items: center; min-height: 32px; padding: 5px 6px 5px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: 13px; line-height: 20px; cursor: pointer; }
    .chevron { flex: none; margin-inline-start: 6px; color: var(--muted); }
    #views-menu[aria-expanded="true"] { background: var(--interaction-selected, var(--hover)); }
    .views-menu { position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + 4px); z-index: 70; min-width: 180px; display: grid; gap: 2px; padding: 6px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
    .views-menu button { min-height: 32px; padding: 6px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: 13px; text-align: start; cursor: pointer; }
    .views-menu button[aria-checked="true"] { font-weight: 500; background: var(--interaction-selected); }
    .views-menu button[role="menuitem"] { border-block-start: 1px solid var(--rule); border-radius: 0; }
    @media (hover: hover) {
        #views-menu:hover { background: var(--hover); }
        .views-menu button:hover { background: var(--interaction-hover); }
        .views-menu button[aria-checked="true"]:hover { background: var(--interaction-selected-hover); }
    }
    .views-menu button:active { background: var(--interaction-pressed); }
    .views-menu button[aria-checked="true"]:active { background: var(--interaction-selected-pressed); }
    #views-menu:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { #views-menu, .views-menu button { min-height: 44px; } }
</style>
