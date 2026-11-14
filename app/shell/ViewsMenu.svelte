<script lang="ts">
    import { pluginContributions, pluginPanels } from "../plugins/contributions";
    import { onMount, tick } from "svelte";
    import Icon from "../controls/Icon.svelte";
    import { menuBehavior, menuPosition } from "../controls/menu";
    import { get } from "svelte/store";
    import type { PanelId } from "../workspace/dock";
    import { contains, dock } from "../workspace/dock";
    import { viewChoices } from "../workspace/panels";

    let root!: HTMLDivElement;
    let trigger = $state<HTMLButtonElement>();
    let list = $state<HTMLDivElement>();
    let position = $state("");
    let menuOpen = $state(false);
    let choices = $derived(viewChoices(pluginPanels($pluginContributions)));

    onMount(() => {
        let openMenu = () => { void show(); };
        window.addEventListener("gg:open-views", openMenu);
        return () => window.removeEventListener("gg:open-views", openMenu);
    });

    async function show() {
        menuOpen = true;
        await tick();
        if (!trigger || !list) return;
        let bounds = trigger.getBoundingClientRect();
        let placed = menuPosition({ x: bounds.right, y: bounds.bottom }, list.getBoundingClientRect(), "below-end");
        position = `left: ${placed.left}px; top: ${placed.top}px;`;
    }

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
    onresize={() => menuOpen = false}
    onpointerdown={event => { if (menuOpen && !root.contains(event.target as Node)) menuOpen = false; }}
    onkeydown={event => { if (event.key === "Escape" && menuOpen) { event.preventDefault(); event.stopPropagation(); menuOpen = false; document.getElementById("views-menu")?.focus(); } }} />

<div class="views" bind:this={root}>
    <button bind:this={trigger} id="views-menu" type="button" aria-label="Views" title="Views" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="views-menu-list" onclick={() => menuOpen ? menuOpen = false : show()} onkeydown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); void show(); } }}><Icon name="layout" /></button>
    {#if menuOpen}
        <div bind:this={list} style={position} id="views-menu-list" class="views-menu" role="menu" tabindex="-1" aria-label="Views" use:menuBehavior={{ onClose: () => menuOpen = false, returnFocus: trigger, initialFocus: "menu" }}>
            {#each choices as choice (choice.id)}
                <button type="button" role="menuitemcheckbox" tabindex="-1" aria-checked={contains($dock.root, choice.id)} onclick={() => toggle(choice.id)}>{choice.label}</button>
            {/each}
            <button type="button" role="menuitem" tabindex="-1" onclick={() => dock.reset()}>Reset layout</button>
        </div>
    {/if}
</div>

<style>
    .views { position: relative; display: flex; align-items: center; }
    #views-menu { display: grid; place-items: center; width: var(--control-height); height: var(--control-height); min-height: var(--control-height); padding: var(--space-1); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); cursor: pointer; }
    #views-menu[aria-expanded="true"] { background: var(--interaction-selected, var(--hover)); }
    .views-menu { position: fixed; max-height: calc(100dvh - 16px); overflow-y: auto; overscroll-behavior: contain; z-index: 70; min-width: 180px; display: grid; gap: var(--gap-row); padding: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius-popover); background: var(--popover-surface); box-shadow: var(--shadow-overlay); }
    .views-menu button { min-height: var(--control-height); padding: var(--space-1) var(--control-padding-inline); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; cursor: pointer; }
    .views-menu button[aria-checked="true"] { font: var(--font-emphasis); background: var(--interaction-selected); }
    .views-menu button[role="menuitem"] { border-block-start: 1px solid var(--popover-rule); border-radius: 0; }
    @media (hover: hover) {
        #views-menu:hover { background: var(--hover); }
        .views-menu button:hover { background: var(--interaction-hover); }
        .views-menu button[aria-checked="true"]:hover { background: var(--interaction-selected-hover); }
    }
    .views-menu:focus { outline: none; }
    .views-menu button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .views-menu button:active { background: var(--interaction-pressed); }
    .views-menu button[aria-checked="true"]:active { background: var(--interaction-selected-pressed); }
    #views-menu:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) {
        #views-menu { width: var(--touch-target); height: var(--touch-target); min-height: var(--touch-target); }
        .views-menu button { min-height: var(--touch-target); }
    }
</style>
