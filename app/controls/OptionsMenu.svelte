<script lang="ts">
    import { tick } from "svelte";
    import Icon from "./Icon.svelte";

    interface Props {
        // an icon button with a menu of independent on/off options, for view settings that don't each earn a toolbar slot
        label: string;
        icon: string;
        /** options with different groups are separated by a rule */
        options: { id: string; label: string; group?: number; checked: boolean; onToggle: () => void }[];
    }

    let { label, icon, options }: Props = $props();

    let open = $state(false);
    let root!: HTMLDivElement;
    let trigger!: HTMLButtonElement;
    let list: HTMLDivElement | undefined = $state();
    let id = `options-${Math.random().toString(36).slice(2, 8)}`;

    let position = $state("");
    // toolbars scroll sideways and would clip a dropdown, so the menu is placed against the window
    async function show(focusFirst = false) {
        open = true;
        await tick();
        let bounds = trigger.getBoundingClientRect(), width = list?.offsetWidth ?? 180;
        let left = Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8));
        position = `top: ${bounds.bottom + 4}px; left: ${left}px;`;
        // focus moves into the menu, so arrows and Escape work however it was opened
        if (focusFirst) list?.querySelector<HTMLButtonElement>("button")?.focus();
        else list?.focus();
    }

    function close(restoreFocus = false) {
        open = false;
        if (restoreFocus) trigger?.focus();
    }

    function key(event: KeyboardEvent) {
        let items = [...(list?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        let index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } close(event.key === "Escape"); return; }
        let next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        items[next]?.focus();
    }
</script>

<svelte:window
    onpointerdown={event => { if (open && !root.contains(event.target as Node)) close(); }}
    onkeydown={event => { if (open && event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(true); } }}
    onresize={() => open && close()} />

<div class="options" bind:this={root}>
    <button bind:this={trigger} type="button" class="trigger" class:open aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onclick={() => open ? close() : show()} onkeydown={event => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); show(true); } }}>
        <Icon name={icon} /><span class="caret"><Icon name="chevron-down" /></span>
    </button>
    {#if open}
        <div {id} class="menu" role="menu" tabindex="-1" aria-label={label} style={position} bind:this={list} onkeydown={key}>
            {#each options as option, index (option.id)}
                {#if index > 0 && (option.group ?? 0) !== (options[index - 1].group ?? 0)}<hr />{/if}
                <button type="button" role="menuitemcheckbox" aria-checked={option.checked} onclick={option.onToggle}>
                    <span class="check" aria-hidden="true">{#if option.checked}<Icon name="check" />{/if}</span>{option.label}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .options { position: relative; display: inline-flex; }
    .trigger { display: inline-flex; align-items: center; gap: 2px; min-height: var(--panel-control-size, 28px); padding: 0 4px 0 6px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 16px; }
    .caret { display: inline-flex; --icon-size: 10px; }
    .trigger.open { background: var(--active); color: var(--text-strong); }
    @media (hover: hover) { .trigger:not(.open):hover { background: var(--hover); color: var(--text); } }
    .trigger:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    /* opens below the button, aligned to its trailing edge where the toolbar keeps its tools */
    .menu { position: fixed; z-index: 70; display: grid; gap: 1px; min-width: 180px; padding: 5px; border: 1px solid var(--border); border-radius: var(--radius-popover); background: var(--popover-surface); box-shadow: var(--shadow-overlay); }
    .menu button { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 4px 10px 4px 6px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; cursor: pointer; }
    .menu hr { margin: 4px 8px; border: 0; border-block-start: 1px solid var(--popover-rule); }
    .check { display: inline-grid; place-items: center; width: 16px; color: var(--text-strong); --icon-size: 14px; }
    .menu:focus { outline: none; }
    .menu button:focus { outline: none; background: var(--interaction-hover); color: var(--text-strong); }
    .menu button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    @media (hover: hover) { .menu button:hover { background: var(--interaction-hover); } }
    @media (pointer: coarse), (max-width: 600px) { .trigger, .menu button { min-height: 44px; } }
</style>
