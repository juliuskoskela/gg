<script lang="ts" generics="Id extends string">
    import { untrack } from "svelte";
    import { tick, type Snippet } from "svelte";
    import { readable } from "svelte/store";
    import { hiddenToolbars, toggleToolbar, useToolbars } from "./toolbars";
    import ToolbarRow from "./ToolbarRow.svelte";
    import Icon from "./Icon.svelte";
    import { panelDraggable } from "../workspace/panelDrag";
    import type { Edge, PanelId } from "../workspace/dock";

    interface Props {
        items: { id: Id; label: string; count?: number }[];
        active: Id | null;
        label?: string;
        prefix?: string;
        draggable?: boolean;
        toolsVisible?: boolean;
        tools?: Snippet | undefined;
        onSelect: (id: Id) => void;
        onClose?: ((id: Id) => void) | null;
        onMove?: (id: PanelId, target: PanelId, edge: Edge) => void;
    }

    let {
        items,
        active,
        label = "Panels",
        prefix = "panel",
        draggable = false,
        toolsVisible = true,
        tools = undefined,
        onSelect,
        onClose = null,
        onMove = () => {}
    }: Props = $props();

    let toolbars = useToolbars() ?? readable(new Map());

    async function revealActive(id: Id) {
        await tick();
        let tab = document.getElementById(`${prefix}-tab-${id}`);
        let item = tab?.parentElement;
        let strip = tab?.closest<HTMLElement>(".panel-tabs");
        if (!item || !strip) return;
        let rtl = getComputedStyle(strip).direction === "rtl";
        let bounds = strip.getBoundingClientRect(), target = item.getBoundingClientRect();
        let left = bounds.left + (rtl ? 12 : 2), right = bounds.right - (rtl ? 2 : 12);
        // oversized touch tabs reveal their label first; native nearest scrolling can hide it.
        let delta = target.width > right - left ? (rtl ? target.right - right : target.left - left)
            : target.left < left ? target.left - left : target.right > right ? target.right - right : 0;
        if (delta) strip.scrollBy({ left: delta, behavior: "instant" });
    }

    function observeTabs(node: HTMLElement) {
        let observer = new ResizeObserver(() => { if (active) void revealActive(active); });
        observer.observe(node);
        return { destroy: () => observer.disconnect() };
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
        document.getElementById(`${prefix}-tab-${id}`)?.focus({ preventScroll: true });
    }
    let contributions = $derived((active ? $toolbars.get(active) : undefined) ?? []);
    let activeLabel = $derived(items.find(item => item.id === active)?.label ?? label);
    let toolbarHidden = $derived(!!active && $hiddenToolbars.has(active));
    let single = $derived(items.length === 1);
    let hasTools = $derived(contributions.length > 0 || (toolsVisible && !!tools));
    $effect(() => {
        let id = active;
        if (id && !single) untrack(() => void revealActive(id));
    });
</script>

{#snippet toolbarToggle()}
    {#if hasTools}
        <button class="toolbar-toggle" class:open={!toolbarHidden} type="button" aria-label={`${toolbarHidden ? "Show" : "Hide"} ${activeLabel} toolbar`}
            title={`${toolbarHidden ? "Show" : "Hide"} toolbar`} aria-expanded={!toolbarHidden} aria-controls={`${prefix}-toolbar-${active}`}
            onclick={() => active && toggleToolbar(active)}>
            <Icon name="sliders" />
        </button>
    {/if}
{/snippet}

<div class="panel-view-top" data-panel-chrome>
    {#if single}
        {@const item = items[0]}
        <div class="panel-titlebar" data-panel-bar>
            <div class="panel-title-item" class:closable={!!onClose}>
            {#if draggable}
                <button class="panel-title" id="{prefix}-tab-{item.id}" type="button" data-panel-handle
                    aria-label={item.label} aria-describedby="{prefix}-drag-help-{item.id}" title="Move {item.label} view"
                    use:panelDraggable={{ id: item.id as PanelId, enabled: true, move: onMove }}
                    onclick={() => onSelect(item.id)} onkeydown={event => keydown(event, 0)}>
                    <span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
                </button>
            {:else}
                <h2 class="panel-title" tabindex="-1" id="{prefix}-tab-{item.id}"><span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}</h2>
            {/if}
            {#if onClose}<button class="panel-close" type="button" aria-label="Close {item.label}" title="Close {item.label}" onclick={() => onClose?.(item.id)}><Icon name="x" /></button>{/if}
            </div>
            {@render toolbarToggle()}
        </div>
    {:else if items.length > 1}
        <div class="panel-tabs-bar" data-panel-bar>
            <div class="panel-tabs" use:observeTabs role="tablist" aria-label={label}>
                {#each items as item, index (item.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions (the inner tab owns keyboard activation; its padding is also clickable) -->
                    <div class="panel-tab-item" class:closable={!!onClose} class:active={active === item.id} role="presentation" onclick={() => onSelect(item.id)}>
                        <!-- svelte-ignore a11y_interactive_supports_focus (roving focus is managed by the tabs) -->
                        <div class="panel-tab" role="tab" id="{prefix}-tab-{item.id}" data-panel-handle tabindex={active === item.id ? 0 : -1}
                            aria-label={item.label} aria-selected={active === item.id} aria-controls="{prefix}-{item.id}"
                            use:panelDraggable={{ id: item.id as PanelId, enabled: draggable, move: onMove }}
                            aria-describedby={draggable ? `${prefix}-drag-help-${items[0]?.id}` : undefined}
                            onfocus={() => void revealActive(item.id)}
                            onkeydown={event => keydown(event, index)}>
                            <span>{item.label}</span>{#if item.count !== undefined}<span class="count">{item.count}</span>{/if}
                        </div>
                        {#if onClose}<button class="panel-close" type="button" aria-label="Close {item.label}" title="Close {item.label}" onclick={event => { event.stopPropagation(); onClose?.(item.id); }}><Icon name="x" /></button>{/if}
                    </div>
                {/each}
            </div>
            {@render toolbarToggle()}
        </div>
    {/if}
    {#if hasTools}
        <ToolbarRow id={`${prefix}-toolbar-${active}`} label={`${activeLabel} toolbar`} hidden={toolbarHidden}>
            {#if contributions.length}{#each contributions as contribution (contribution.id)}{@render contribution.content()}{/each}{:else}{@render tools?.()}{/if}
        </ToolbarRow>
    {/if}
    {#if draggable && items.length}<span id="{prefix}-drag-help-{items[0].id}" hidden>Space to pick up, Tab to choose a panel, arrows to split, Enter to drop, Escape to cancel.</span>{/if}
</div>

<style>
    /* title and toolbar are one header block, so the only rule is the one closing it off from content */
    .panel-view-top { flex: none; min-width: 0; margin-block-end: var(--panel-content-gap); container: panel-titlebar / inline-size; background: var(--panel-header-bg); border-block-end: 1px solid var(--panel-header-rule); }
    /* labels align with the toolbar and content inset; their hover pills overhang into the gutter */
    .panel-tabs-bar, .panel-titlebar { min-width: 0; padding: var(--panel-bar-padding) var(--panel-inset) var(--panel-bar-padding) calc(var(--panel-inset) - 8px); }
    .panel-view-top :global(.view-toolbar) { border-block-end: 0; padding-block-start: 0; min-height: 0; }
    .panel-tabs-bar, .panel-titlebar { min-height: var(--panel-tabs-height); }
    .panel-tabs-bar, .panel-titlebar { display: flex; align-items: center; gap: var(--panel-gap); }
    .panel-title-item { display: flex; flex: 0 1 auto; align-items: center; min-width: 0; padding-inline-end: 8px; border-radius: var(--radius-control); pointer-events: auto; }
    .panel-title-item.closable { padding-inline-end: 2px; }
    .panel-title { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; min-height: var(--panel-control-size); margin: 0; padding: 4px 0 4px 8px; border: 0; border-radius: var(--radius-control); color: var(--text); background: transparent; text-align: start; font: 500 var(--type-ui)/20px var(--stack-ui); }
    .panel-title > span:first-of-type { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button.panel-title { cursor: grab; }
    .toolbar-toggle { display: grid; place-items: center; flex: none; margin-inline-start: auto; width: var(--panel-control-size); height: var(--panel-control-size); padding: 6px; border: 0; border-radius: var(--radius-control); color: var(--muted); background: transparent; cursor: pointer; pointer-events: auto; }
    .toolbar-toggle { --icon-size: 16px; }
    .toolbar-toggle.open { color: var(--text); }
    .toolbar-toggle:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    @media (hover: hover) { .toolbar-toggle:hover { color: var(--text); background: color-mix(in srgb, var(--text) 8%, transparent); } }
    .toolbar-toggle:active { background: color-mix(in srgb, var(--text) 16%, transparent); }
    .panel-tabs { display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; min-height: var(--panel-control-size); overflow-x: auto; overscroll-behavior-inline: contain; scroll-padding-inline: 2px 12px; padding-inline-end: 12px; pointer-events: auto; mask-image: linear-gradient(to right, black calc(100% - 12px), transparent); }
    .panel-tabs:dir(rtl) { mask-image: linear-gradient(to left, black calc(100% - 12px), transparent); }
    .panel-tabs { scrollbar-width: none; }
    .panel-tabs::-webkit-scrollbar { display: none; }
    .panel-tab-item { padding-inline-end: 8px; display: inline-flex; flex: none; align-items: center; border-radius: var(--radius-control); color: var(--muted); pointer-events: auto; }
    .panel-tab-item.closable { padding-inline-end: 2px; }
    .panel-tab-item.active { color: var(--text); background: var(--panel-tab-active); }
    .panel-tab { display: inline-flex; align-items: center; gap: var(--panel-gap); flex-shrink: 0; min-height: var(--panel-control-size); padding: 4px 0 4px 8px; border-radius: var(--radius-control); color: inherit; font-size: var(--type-ui); font-weight: 400; line-height: 20px; white-space: nowrap; cursor: pointer; pointer-events: auto; }
    .panel-tab-item.active > .panel-tab { font-weight: 500; }
    [data-panel-handle]:global(.neodrag-dragging) { opacity: .45; cursor: grabbing; }
    .count { color: var(--muted); font-size: var(--type-caption); font-weight: 400; font-variant-numeric: tabular-nums; }
    [data-panel-handle]:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    .panel-close { display: grid; place-items: center; flex-shrink: 0; width: var(--panel-control-size); height: var(--panel-control-size); padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; pointer-events: auto; overflow: hidden; --icon-size: 14px; }
    .panel-tab-item > .panel-close, .panel-title-item > .panel-close { justify-items: start; padding-inline-start: 4px; }
    @media (hover: hover) { .panel-tab-item:hover, .panel-title-item:has(> button.panel-title):hover { background: var(--hover); color: var(--text); } .panel-close:hover { color: var(--text-strong); } }
    .panel-tab-item > .panel-tab:focus-visible { outline: none; }
    .panel-tab-item:has(> .panel-tab:focus-visible) { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    @media (hover: hover) and (pointer: fine) and (min-width: 601px) {
        .panel-tab-item.closable, .panel-title-item.closable { padding-inline-end: 8px; transition: padding-inline-end var(--motion-feedback) ease-out; }
        .panel-tab-item .panel-close, .panel-title-item .panel-close { width: 0; padding-inline-start: 0; opacity: 0; transition: width var(--motion-feedback) ease-out, padding-inline-start var(--motion-feedback) ease-out, opacity var(--motion-feedback) ease-out; }
        .panel-tab-item.closable:hover, .panel-tab-item.closable:has(:focus-visible), .panel-title-item.closable:hover, .panel-title-item.closable:has(:focus-visible) { padding-inline-end: 2px; }
        .panel-tab-item:hover .panel-close, .panel-tab-item:has(:focus-visible) .panel-close, .panel-title-item:hover .panel-close, .panel-title-item:has(:focus-visible) .panel-close { width: 24px; padding-inline-start: 4px; opacity: 1; }
    }
    @media (forced-colors: active) { .panel-tabs { mask-image: none; } .panel-tab-item.active { background: Highlight; color: HighlightText; } }
</style>
