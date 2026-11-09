<script lang="ts">
    import { menuBehavior, menuPosition } from "./menu";
    import { currentWorkspaceIdentity } from "../commands/context";
    import type { Operand } from "../messages/Operand";
    import { currentMutation, ignoreToggled } from "../stores";
    import { mutationPending } from "../operations";
    import { contextCommands, revisionCommands, type Command } from "../commands/registry";
    import Icon from "./Icon.svelte";
    import { annotationCommands } from "../annotations/commands";
    import { openViewCommands } from "../workspace/viewCommands";

    let menuElement!: HTMLDivElement;
    // apple hig: context menus hide unavailable items rather than dimming them; the palette still lists them with reasons.
    function sections(all: Command[]): Command[][] {
        let available = all.filter(command => !command.reason);
        let groups = new Map<number, Command[]>();
        for (let command of available) {
            let group = command.destructive ? Number.MAX_SAFE_INTEGER : command.group ?? 0;
            groups.set(group, [...(groups.get(group) ?? []), command]);
        }
        return [...groups.entries()].sort(([a], [b]) => a - b).map(([, commands]) => commands);
    }

    function actionCommands(operand: Operand | null, ..._dependencies: unknown[]): Command[] {
        if (!operand) return [];
        return operand.type === "Revision" ? revisionCommands([operand.header], false, $ignoreToggled, $currentMutation, $mutationPending) : operand.type === "Revisions" ? revisionCommands(operand.headers, false, $ignoreToggled, $currentMutation, $mutationPending) : contextCommands(operand, $currentWorkspaceIdentity, $ignoreToggled, $currentMutation, $mutationPending);
    }

    interface Props {
        operand?: Operand | null;
        /** a fixed list, for menus about things that aren't operands, such as diff lines */
        items?: Command[] | null;
        heading?: string | null;
        x: number;
        y: number;
        placement?: "pointer" | "above-end";
        onClose: () => void;
        // every menu ends with the views that can still be opened, so right-clicking is always a way to add one
        views?: boolean;
    }

    let {
        operand = null,
        items = null,
        heading = null,
        x,
        y,
        placement = "pointer",
        onClose,
        views = true
    }: Props = $props();
    let commands = $derived(items ?? [...actionCommands(operand, $currentWorkspaceIdentity, $ignoreToggled, $currentMutation, $mutationPending), ...annotationCommands(operand)]);
    let viewItems = $derived(views ? openViewCommands().filter(command => !command.reason) : []);
    // destructive actions stay last, after the views
    let actionSections = $derived(sections(commands));
    let destructive = $derived(actionSections.filter(section => section.every(command => command.destructive)));
    let grouped = $derived([...actionSections.filter(section => !destructive.includes(section)), ...(viewItems.length ? [viewItems] : []), ...destructive]);
    // a title only when it clarifies scope: several revisions at once
    let title = $derived(heading ?? (operand?.type === "Revisions" && operand.headers.length > 1 ? `${operand.headers.length} revisions` : null));
    let unavailable = $derived(grouped.length === 0 ? (commands.find(command => command.reason)?.reason ?? (views ? "All views are open" : "No actions available")) : null);
    $effect(() => {
        if (menuElement) {
            let rect = menuElement.getBoundingClientRect();
            let position = menuPosition({ x, y }, rect, placement);
            menuElement.style.left = `${position.left}px`;
            menuElement.style.top = `${position.top}px`;
        }
    });
</script>
<svelte:window onclick={onClose} onblur={onClose} onresize={onClose} />
<!-- svelte-ignore a11y_click_events_have_key_events (menuBehavior provides keyboard interaction) -->
<div class="context-menu" style="left: {x}px; top: {y}px;" role="menu" tabindex="-1" aria-label={title ?? "Actions"} onclick={event => event.stopPropagation()} oncontextmenu={event => { event.stopPropagation(); event.preventDefault(); }} use:menuBehavior={{ onClose, initialFocus: "menu", followPointer: true }} bind:this={menuElement}>
    {#if title}<p class="menu-title" role="presentation">{title}</p>{/if}
    {#each grouped as section, index}
        {#if index > 0}<hr />{/if}
        {#each section as command (command.id)}
            <button role="menuitem" class:destructive={command.destructive} tabindex="-1" onclick={() => { command.execute(); onClose(); }}><Icon name={command.icon} /><span>{command.label}</span></button>
        {/each}
    {/each}
    {#if unavailable}<p class="menu-empty" role="presentation">{unavailable}</p>{/if}
</div>

<style>
    .context-menu {
        position: fixed; z-index: 1000;
        min-width: 220px; max-width: min(320px, calc(100vw - 24px)); max-height: calc(100dvh - 16px);
        padding: 5px;
        overflow-y: auto; overscroll-behavior: contain;
        background: var(--popover-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-popover);
        box-shadow: var(--shadow-overlay);
        pointer-events: auto;
        font: 400 var(--type-ui)/1.3 var(--stack-ui);
        color: var(--text);
    }
    @media (prefers-reduced-motion: no-preference) {
        .context-menu { animation: menu-in 120ms var(--motion-sheet-ease); transform-origin: top left; }
        @keyframes menu-in { from { opacity: 0; scale: .97; } }
    }
    button {
        display: flex; align-items: center; gap: 10px;
        width: 100%; min-height: 28px; padding: 4px 10px 4px 8px;
        border: 0; border-radius: var(--radius-control);
        background: transparent; color: inherit; font: inherit; text-align: start;
        cursor: pointer; outline: none;
    }
    button > :global(svg) { --icon-size: 15px; color: var(--muted); }
    button span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* pointer moves focus so keyboard and pointer share one highlight. */
    button:focus { background: var(--interaction-hover); color: var(--text-strong); }
    button:focus > :global(svg) { color: currentColor; }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    button:active { background: var(--interaction-pressed); }
    .destructive { color: var(--negative); }
    .destructive > :global(svg) { color: currentColor; }
    .destructive:focus > :global(svg) { color: var(--negative); }
    .context-menu:focus { outline: none; }
    hr { margin: 5px 10px; border: 0; border-block-start: 1px solid var(--popover-rule); }
    .menu-title { margin: 0; padding: 4px 10px 6px; color: var(--muted); font-size: var(--type-caption); font-weight: 500; }
    .menu-empty { margin: 0; padding: 6px 10px; color: var(--muted); }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
    @media (forced-colors: active) {
        .context-menu { backdrop-filter: none; background: Canvas; border-color: CanvasText; }
        button:focus { background: Highlight; color: HighlightText; }
    }
</style>
