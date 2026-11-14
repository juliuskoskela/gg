<script lang="ts">
    import Icon from "./Icon.svelte";
    import type { DropdownMenu, MenuEntry } from "../commands/menus";

    interface Props {
        menu: DropdownMenu;
        idPrefix: string;
        onActivate: (item: MenuEntry) => void;
    }

    let { menu, idPrefix, onActivate }: Props = $props();
</script>

{#if menu.context}<p class="menu-context" role="presentation">{menu.context}</p>{/if}
{#each menu.sections as section, sectionIndex}
    {#if sectionIndex > 0}<hr />{/if}
    {#each section.items as item (item.id)}
        {@const reasonId = `${idPrefix}-${item.id.replace(/[^\w-]/g, "-")}-reason`}
        <button
            type="button"
            role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked}
            aria-describedby={item.reason ? reasonId : undefined}
            class="menu-item"
            class:destructive={item.destructive}
            disabled={!!item.reason}
            title={item.reason ?? undefined}
            tabindex="-1"
            onclick={() => onActivate(item)}
        >
            <span class="item-icon" aria-hidden="true">
                {#if item.checked !== undefined}
                    {#if item.checked}<Icon name="check" />{/if}
                {:else}
                    <Icon name={item.icon} />
                {/if}
            </span>
            <span class="item-label">{item.label}</span>
            <!-- aria-hidden keeps the reason out of the item's name; aria-describedby still reads it -->
            {#if item.reason}
                <small id={reasonId} class="item-meta reason" aria-hidden="true">{item.reason}</small>
            {:else if item.shortcut}
                <small class="item-meta shortcut" aria-hidden="true">{item.shortcut}</small>
            {/if}
        </button>
    {/each}
{/each}

<style>
    .menu-context { margin: 0 0 var(--space-1); padding: var(--space-1) var(--space-2); border-block-end: 1px solid var(--popover-rule); color: var(--muted); font: var(--font-label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    hr { margin: var(--space-1) var(--space-2); border: 0; border-block-start: 1px solid var(--popover-rule); }
    .menu-item { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--space-2); width: 100%; min-height: var(--panel-control-size); padding: var(--space-1) var(--control-padding-inline); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; cursor: pointer; outline: none; }
    .menu-item:disabled { color: var(--text-disabled); cursor: default; }
    .item-icon { display: inline-grid; place-items: center; flex: none; width: var(--space-4); color: var(--muted); --icon-size: 15px; }
    .menu-item:disabled .item-icon { color: var(--text-disabled); }
    /* the label gives way first, so a shortcut always stays on its line */
    .item-label { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item-meta { flex: none; color: var(--muted); font: var(--font-label); white-space: nowrap; }
    /* a cut-off reason explains nothing, so it takes its own line under the label and wraps */
    .reason { flex: 1 0 100%; padding-inline-start: calc(var(--space-4) + var(--space-2)); white-space: normal; text-align: start; }
    .menu-item:disabled .item-meta { color: var(--text-disabled); }
    .menu-item:not(:disabled):focus { background: var(--interaction-hover); color: var(--text-strong); }
    .menu-item:not(:disabled):focus .item-icon { color: currentColor; }
    .menu-item:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .menu-item:not(:disabled):active { background: var(--interaction-pressed); }
    .menu-item.destructive:not(:disabled), .menu-item.destructive:not(:disabled) .item-icon { color: var(--negative); }

    @media (hover: hover) {
        .menu-item:not(:disabled):hover { background: var(--interaction-hover); color: var(--text-strong); }
        .menu-item:not(:disabled):hover .item-icon { color: currentColor; }
        .menu-item.destructive:not(:disabled):hover .item-icon { color: var(--negative); }
    }
    @media (pointer: coarse), (max-width: 600px) {
        .menu-item { min-height: var(--touch-target); }
        .shortcut { display: none; }
    }
    @media (forced-colors: active) {
        .menu-item:not(:disabled):focus { background: Highlight; color: HighlightText; }
    }
</style>
