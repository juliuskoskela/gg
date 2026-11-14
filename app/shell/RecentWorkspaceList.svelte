<script lang="ts">
    import Icon from "../controls/Icon.svelte";
    import { navigationIndex, visibleItems } from "../controls/listNavigation";
    import { folderName, parentPath, shortenHome, splitForTruncation } from "./start";

    interface Props {
        workspaces: string[];
        home?: string | null;
        onOpen: (path: string) => void;
    }

    let { workspaces, home = null, onOpen }: Props = $props();

    let rows = $derived([...new Set(workspaces)].filter(Boolean).map(path => {
        let parent = shortenHome(parentPath(path), home);
        return { path, name: folderName(path), parent, ...splitForTruncation(parent) };
    }));

    // arrows move between rows without opening them; enter or click opens
    function navigate(event: KeyboardEvent) {
        let list = (event.currentTarget as HTMLElement).closest<HTMLElement>(".recent-list")!;
        let buttons = visibleItems(list, "button[data-recent]");
        let next = navigationIndex(event.key, buttons.indexOf(event.currentTarget as HTMLElement), buttons.length);
        if (next === null) return;
        event.preventDefault();
        buttons[next]?.focus();
    }
</script>

{#if rows.length}
    <ul class="recent-list" aria-label="Recent workspaces">
        {#each rows as row (row.path)}
            <li>
                <button type="button" data-recent title={row.path} aria-label="{row.name}, {row.path}" onclick={() => onOpen(row.path)} onkeydown={navigate}>
                    <Icon name="folder" />
                    <span class="name">{row.name}</span>
                    {#if row.parent}
                        <span class="path" dir="ltr">{#if row.head}<span class="head">{row.head}</span>{/if}<span class="tail">{row.tail}</span></span>
                    {/if}
                </button>
            </li>
        {/each}
    </ul>
{/if}

<style>
    .recent-list { display: grid; gap: var(--gap-row); margin: 0; padding: 0; list-style: none; }
    li { min-width: 0; }
    button { display: grid; grid-template-columns: auto minmax(0, max-content) minmax(0, 1fr); align-items: center; column-gap: var(--space-2); width: 100%; min-height: 32px; padding: var(--space-1) var(--space-2); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; cursor: pointer; --icon-size: 14px; }
    button :global(svg) { color: var(--muted); }
    @media (hover: hover) { button:hover { background: var(--interaction-hover); } }
    button:active { background: var(--interaction-pressed); }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .name { min-width: 0; overflow: hidden; color: var(--text-strong); font: var(--font-emphasis); text-overflow: ellipsis; white-space: nowrap; }
    /* paths read left to right in any locale; the start gives way so the nearest folder stays */
    .path { display: flex; min-width: 0; color: var(--muted); font: var(--font-id); unicode-bidi: isolate; white-space: nowrap; }
    .head { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .tail { flex: none; }
    :global([dir="rtl"]) .path { justify-content: flex-end; }
    @media (pointer: coarse), (max-width: 600px) {
        button { grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; row-gap: 0; min-height: 44px; }
        .path { grid-column: 2; }
    }
</style>
