<script lang="ts" generics="Id extends string">
    import { tick } from "svelte";
    import Icon from "./Icon.svelte";
    import { panelDraggable } from "../workspace/panelDrag";
    import type { Edge, PanelId } from "../workspace/dock";

    export let items: { id: Id; label: string; count?: number }[];
    export let active: Id | null;
    export let label = "Panels";
    export let prefix = "panel";
    export let draggable = false;
    export let toolsVisible = true;
    export let onSelect: (id: Id) => void;
    export let onClose: ((id: Id) => void) | null = null;
    export let onMove: (id: PanelId, target: PanelId, edge: Edge) => void = () => {};


    $: single = items.length === 1;
    $: hasTools = toolsVisible && !!$$slots.tools;
    $: if (active && !single) void revealActive(active);

    async function revealActive(id: Id) {
        await tick();
        document.getElementById(`${prefix}-tab-${id}`)?.parentElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    function keydown(event: KeyboardEvent, index: number) {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Delete" && onClose) { event.preventDefault(); onClose(items[index].id); return; }
        if (single) return;
        let rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl";
        let next = index;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        else if (event.key === "ArrowRight") next += rtl ? -1 : 1;
        else if (event.key === "ArrowLeft") next += rtl ? 1 : -1;
        else if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        let id = items[(next + items.length) % items.length].id;
        onSelect(id);
        document.getElementById(`${prefix}-tab-${id}`)?.focus();
    }
</script>

<div class="panel-view-top">
    {#if single}
        {@const item = items[0]}
        <div class="panel-titlebar" class:has-tools={hasTools} data-panel-bar>
            <div class="panel-title-item">
            {#if draggable}
                <button class="panel-title" id="{prefix}-tab-{item.id}" type="button" data-panel-handle
                    aria-label={item.label} aria-describedby="{prefix}-drag-help-{item.id}" title="Move {item.label} view"
                    use:panelDraggable={{ id: item.id as PanelId, enabled: true, move: onMove }}
                    on:click={() => onSelect(item.id)} on:keydown={event => keydown(event, 0)}>
                    <svg class="panel-grip" width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" /><circle cx="2" cy="6" r="1" /><circle cx="6" cy="6" r="1" /><circle cx="2" cy="10" r="1" /><circle cx="6" cy="10" r="1" /></svg>
                    <span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
                </button>
            {:else}
                <h2 class="panel-title" tabindex="-1" id="{prefix}-tab-{item.id}"><span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}</h2>
            {/if}
            {#if onClose}<button class="panel-close" type="button" aria-label="Close {item.label}" title="Close {item.label}" on:click={() => onClose?.(item.id)}><Icon name="x" /></button>{/if}
            </div>
            {#if hasTools}<div class="panel-header-tools" data-panel-toolbar><slot name="tools" /></div>{/if}
        </div>
    {:else if items.length > 1}
        <div class="panel-tabs-bar" data-panel-bar>
            <div class="panel-tabs" role="tablist" aria-label={label}>
                {#each items as item, index (item.id)}
                    <div class="panel-tab-item" class:active={active === item.id} role="presentation">
                        <!-- svelte-ignore a11y_interactive_supports_focus (roving focus is managed by the tabs) -->
                        <div class="panel-tab" role="tab" id="{prefix}-tab-{item.id}" data-panel-handle tabindex={active === item.id ? 0 : -1}
                            aria-label={item.label} aria-selected={active === item.id} aria-controls="{prefix}-{item.id}"
                            use:panelDraggable={{ id: item.id as PanelId, enabled: draggable, move: onMove }}
                            aria-describedby={draggable ? `${prefix}-drag-help-${items[0]?.id}` : undefined}
                            on:focus={event => { if (event.currentTarget.matches(":focus-visible")) event.currentTarget.parentElement?.scrollIntoView({ block: "nearest", inline: "nearest" }); }}
                            on:click={() => onSelect(item.id)} on:keydown={event => keydown(event, index)}>
                            <span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
                        </div>
                        {#if onClose}<button class="panel-close" type="button" aria-label="Close {item.label}" title="Close {item.label}" on:click|stopPropagation={() => onClose?.(item.id)}><Icon name="x" /></button>{/if}
                    </div>
                {/each}
            </div>
        </div>
        {#if hasTools}<div class="panel-view-toolbar" data-panel-toolbar><slot name="tools" /></div>{/if}
    {/if}
    {#if draggable && items.length}<span id="{prefix}-drag-help-{items[0].id}" hidden>Space to pick up, Tab to choose a panel, arrows to split, Enter to drop, Escape to cancel.</span>{/if}
</div>

<style>
    .panel-view-top { flex: none; min-width: 0; container: panel-titlebar / inline-size; background: var(--panel-header-bg); }
    .panel-tabs-bar, .panel-titlebar, .panel-view-toolbar { min-width: 0; border-block-end: 1px solid var(--rule); padding: var(--panel-bar-padding) var(--panel-inset); }
    .panel-tabs-bar, .panel-titlebar { min-height: var(--panel-tabs-height); }
    .panel-titlebar { display: flex; align-items: center; gap: var(--panel-gap); }
    .panel-titlebar.has-tools { display: grid; grid-template-columns: auto minmax(0, 1fr); }
    .panel-title-item { display: flex; align-items: center; min-width: 0; pointer-events: auto; }
    .panel-title { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; min-height: var(--panel-control-size); margin: 0; padding: 0; border: 0; border-radius: var(--radius-sm); color: var(--text-strong); background: transparent; text-align: start; font: 500 var(--type-ui)/20px var(--stack-ui); }
    .panel-title > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button.panel-title { cursor: grab; }
    .panel-grip { flex: none; color: var(--faint); opacity: .65; }
    .panel-header-tools { min-width: 0; width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; pointer-events: auto; }
    .panel-header-tools > :global(*) { min-width: max-content; }
    .panel-view-toolbar { display: flex; align-items: center; min-height: var(--panel-toolbar-height); }
    .panel-tabs { display: flex; align-items: center; gap: 4px; min-width: 0; min-height: var(--panel-control-size); overflow-x: auto; pointer-events: auto; }
    .panel-tab-item { display: inline-flex; flex: none; align-items: center; border-radius: var(--radius-control); color: var(--muted); pointer-events: auto; }
    .panel-tab-item.active { color: var(--text-strong); background: var(--panel-tab-active); }
    .panel-tab { display: inline-flex; align-items: center; gap: var(--panel-gap); flex-shrink: 0; min-height: var(--panel-control-size); padding: 4px 0 4px 8px; border-radius: var(--radius-control); color: inherit; font-size: var(--type-ui); font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; pointer-events: auto; }
    [data-panel-handle]:global(.neodrag-dragging) { opacity: .45; cursor: grabbing; }
    .count { color: var(--muted); font-size: var(--type-caption); font-weight: 400; font-variant-numeric: tabular-nums; }
    [data-panel-handle]:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -1px; }
    .panel-close { display: grid; place-items: center; flex-shrink: 0; width: var(--panel-control-size); height: var(--panel-control-size); padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; pointer-events: auto; --icon-size: 14px; }
    .panel-tab-item > .panel-close, .panel-title-item > .panel-close { justify-items: start; padding-inline-start: 4px; }
    @media (hover: hover) { .panel-tab-item:hover { background: var(--hover); color: var(--text); } .panel-close:hover { background: var(--active); color: var(--text-strong); } button.panel-title:hover .panel-grip { opacity: 1; } }
    @media (hover: hover) and (pointer: fine) and (min-width: 601px) {
        .panel-tab-item .panel-close, .panel-title-item .panel-close { opacity: 0; transition: opacity var(--motion-feedback) ease-out; }
        .panel-tab-item:hover .panel-close, .panel-tab-item:focus-within .panel-close, .panel-title-item:hover .panel-close, .panel-title-item:focus-within .panel-close { opacity: 1; }
    }
    @media (forced-colors: active) { .panel-tab-item.active { background: Highlight; color: HighlightText; } .panel-grip { opacity: 1; } }
</style>
