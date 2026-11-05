<script lang="ts" generics="Id extends string">
    import Icon from "./Icon.svelte";
    import { panelDraggable } from "../workspace/panelDrag";
    import type { Edge, PanelId } from "../workspace/dock";

    export let items: { id: Id; label: string; count?: number }[];
    export let active: Id | null;
    export let label = "Panels";
    export let prefix = "panel";
    export let draggable = false;
    export let toolsVisible = true;
    export let toolsWrap = false;
    export let onSelect: (id: Id) => void;
    export let onClose: ((id: Id) => void) | null = null;
    export let onMove: (id: PanelId, target: PanelId, edge: Edge) => void = () => {};


    function keydown(event: KeyboardEvent, index: number) {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Delete" && onClose) { event.preventDefault(); onClose(items[index].id); return; }
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

<!-- svelte-ignore a11y_interactive_supports_focus (focus is managed by the tabs) -->
<div class="panel-tabs-bar">
<div class="panel-tabs-layout" class:has-tools={toolsVisible && !!$$slots.tools} class:wrap-tools={toolsVisible && toolsWrap && !!$$slots.tools}>

<div class="panel-tabs" role="tablist" aria-label={label}>
    {#each items as item, index (item.id)}
        <div class="panel-tab-item" class:active={active === item.id} role="presentation">
        <div class="panel-tab" role="tab" id="{prefix}-tab-{item.id}" tabindex={active === item.id ? 0 : -1}
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
{#if draggable}<span id="{prefix}-drag-help-{items[0]?.id}" hidden>Space to pick up, Tab to choose a panel, arrows to split, Enter to drop, Escape to cancel.</span>{/if}
{#if toolsVisible && $$slots.tools}<div class="panel-header-tools"><slot name="tools" /></div>{/if}
</div>
</div>

<style>
    .panel-tabs-bar { flex-shrink: 0; min-width: 0; background: var(--panel-header-bg); border-block-end: 1px solid var(--rule); container: panel-titlebar / inline-size; }
    .panel-tabs-layout { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; min-height: calc(var(--panel-tabs-height) - 1px); padding: var(--panel-bar-padding) var(--panel-inset); }
    .has-tools.wrap-tools .panel-tabs { flex: 0 1 auto; }
    .panel-header-tools { display: flex; align-items: center; justify-content: flex-end; flex: none; min-width: 0; margin-inline-start: auto; pointer-events: auto; }
    .wrap-tools .panel-header-tools { flex: 1; }
    @container panel-titlebar (max-width: 520px) {
        .panel-tabs-layout.wrap-tools { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: var(--panel-gap); row-gap: var(--panel-gap); }
        .wrap-tools .panel-header-tools { grid-column: 1 / -1; grid-row: 2; width: 100%; }
        .wrap-tools .panel-tabs { grid-column: 1 / -1; grid-row: 1; }
    }
    .panel-tabs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; min-height: var(--panel-control-size); padding: 0; overflow-x: auto; pointer-events: auto; }
    .panel-tab-item { display: inline-flex; flex: none; align-items: center; border-radius: var(--radius-control); color: var(--muted); pointer-events: auto; }
    .panel-tab-item.active { color: var(--text-strong); background: var(--panel-tab-active); }
    .panel-tab { display: inline-flex; align-items: center; gap: var(--panel-gap); flex-shrink: 0; min-height: var(--panel-control-size); padding: 4px 8px; border-radius: var(--radius-control); color: inherit; font-size: var(--type-ui); font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; pointer-events: auto; }
    .panel-tab:global(.neodrag-dragging) { opacity: .45; cursor: grabbing; }
    .count { color: var(--muted); font-size: var(--type-caption); font-weight: 400; font-variant-numeric: tabular-nums; }
    .panel-tab:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -1px; }
    button { display: grid; place-items: center; flex-shrink: 0; width: var(--panel-control-size); height: var(--panel-control-size); padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 14px; }
    @media (hover: hover) { .panel-tab-item:hover { background: var(--hover); color: var(--text); } button:hover { background: var(--active); color: var(--text-strong); } }
    @media (forced-colors: active) { .panel-tab-item.active { background: Highlight; color: HighlightText; } }
</style>
