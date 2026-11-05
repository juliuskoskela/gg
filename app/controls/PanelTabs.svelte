<script lang="ts" generics="Id extends string">
    import Icon from "./Icon.svelte";

    export let items: { id: Id; label: string; count?: number }[];
    export let active: Id | null;
    export let label = "Panels";
    export let prefix = "panel";
    export let draggable = false;
    export let drop = false;
    export let onSelect: (id: Id) => void;
    export let onClose: ((id: Id) => void) | null = null;
    export let onDragStart: (event: DragEvent, id: Id) => void = () => {};
    export let onDragEnd: () => void = () => {};
    export let onDragOver: (event: DragEvent) => void = () => {};
    export let onDragLeave: (event: DragEvent) => void = () => {};
    export let onDrop: (id: Id) => void = () => {};

    function keydown(event: KeyboardEvent, index: number) {
        if (event.target !== event.currentTarget) return;
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
<div class="panel-tabs-bar" class:drop>
<div class="panel-tabs" role="tablist" aria-label={label}
    on:dragover={onDragOver} on:dragleave={onDragLeave} on:drop|preventDefault={() => active && onDrop(active)}>
    {#each items as item, index (item.id)}
        <div class="panel-tab" role="tab" id="{prefix}-tab-{item.id}" tabindex={active === item.id ? 0 : -1}
            aria-label={item.label} aria-selected={active === item.id} aria-controls="{prefix}-{item.id}" {draggable}
            on:click={() => onSelect(item.id)} on:keydown={event => keydown(event, index)}
            on:dragstart={event => onDragStart(event, item.id)} on:dragend={onDragEnd}
            on:dragover|stopPropagation={onDragOver} on:drop|preventDefault|stopPropagation={() => onDrop(item.id)}>
            <span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
        </div>
    {/each}
</div>
{#if onClose && active}<button class="panel-close" type="button" aria-label="Close {items.find(item => item.id === active)?.label ?? 'panel'}" on:click={() => active && onClose?.(active)}><Icon name="x" /></button>{/if}
</div>

<style>
    .panel-tabs-bar { display: flex; align-items: center; flex-shrink: 0; min-width: 0; background: var(--panel-header-bg); border-block-end: 1px solid var(--rule); padding-inline-end: var(--panel-inset); }
    .panel-tabs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; min-height: calc(var(--panel-tabs-height) - 1px); padding: 3px var(--panel-inset); overflow-x: auto; pointer-events: auto; }
    .panel-tabs-bar.drop { background: var(--active); }
    .panel-tab { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; min-height: 24px; padding: 2px 8px; border-radius: var(--radius-control); color: var(--muted); font-size: var(--type-ui); font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; pointer-events: auto; }
    .panel-tab[aria-selected="true"] { color: var(--text-strong); background: var(--panel-tab-active); }
    .count { color: var(--muted); font-size: var(--type-caption); font-weight: 400; font-variant-numeric: tabular-nums; }
    .panel-tab:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -1px; }
    button { display: grid; place-items: center; flex-shrink: 0; width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 12px; }
    @media (hover: hover) { .panel-tab:hover { background: var(--hover); color: var(--text); } button:hover { background: var(--active); color: var(--text-strong); } }
    @media (pointer: coarse), (max-width: 600px) { .panel-tab { min-height: 37px; } button { width: 32px; height: 32px; } }
    @media (forced-colors: active) { .panel-tab[aria-selected="true"] { background: Highlight; color: HighlightText; } }
</style>
