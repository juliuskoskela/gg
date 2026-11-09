<script lang="ts" module>
    export type LogEntry = {
        id: string;
        title: string;
        /** a short hash or id, shown in the code face */
        code?: string;
        who?: string;
        time?: string;
        badge?: string;
        tone?: "default" | "muted" | "warning";
    };
</script>

<script lang="ts">
    import { navigationIndex, visibleItems } from "./listNavigation";
    import type { Snippet } from "svelte";
    import { tick } from "svelte";

    interface Props {
        // one dense line per entry, like the timeline: id, title, badge, who, when
        rows: LogEntry[];
        label: string;
        selected?: string;
        onSelect: (id: string) => void;
        columns?: { code?: boolean; who?: boolean; time?: boolean };
        /** extra controls at the end of a row */
        trailing?: Snippet<[LogEntry]> | undefined;
        /** when set, F2 or double-click renames an entry in place */
        onRename?: ((id: string, title: string) => void) | undefined;
    }

    let {
        rows,
        label,
        selected = "",
        onSelect,
        columns = {},
        trailing = undefined,
        onRename = undefined
    }: Props = $props();

    let renaming: { id: string; title: string } | null = $state(null);
    let input: HTMLInputElement | undefined = $state();
    let show = $derived({ code: true, who: true, time: true, ...columns });

    let clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
    let day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    let dated = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
    function when(timestamp: string) {
        let date = new Date(timestamp), now = new Date();
        if (date.toDateString() === now.toDateString()) return clock.format(date);
        return date.getFullYear() === now.getFullYear() ? day.format(date) : dated.format(date);
    }

    async function rename(row: LogEntry) {
        if (!onRename) return;
        renaming = { id: row.id, title: row.title };
        await tick();
        input?.select();
    }

    function finish(commit: boolean) {
        if (commit && renaming && renaming.title.trim()) onRename?.(renaming.id, renaming.title.trim());
        renaming = null;
    }

    function navigate(event: KeyboardEvent, row: LogEntry) {
        if (event.key === "F2" && onRename) { event.preventDefault(); rename(row); return; }
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        let buttons = visibleItems((event.currentTarget as HTMLElement).closest<HTMLElement>(".log-list")!, "button[data-log-row]");
        let index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
        event.preventDefault();
        let next = navigationIndex(event.key, index, buttons.length)!;
        buttons[next]?.focus(); buttons[next]?.click();
    }
</script>

<ul class="log-list" aria-label={label}>
    {#each rows as row (row.id)}
        <li class="log-row" class:selected={selected === row.id}>
            {#if renaming?.id === row.id}
                <input class="rename" bind:this={input} bind:value={renaming.title} aria-label="Rename {row.title}"
                    onkeydown={event => { if (event.key === "Enter") finish(true); else if (event.key === "Escape") { event.stopPropagation(); finish(false); } }} onblur={() => finish(true)} />
            {:else}
                <button type="button" data-log-row aria-pressed={selected === row.id} title={row.time ? new Date(row.time).toLocaleString() : undefined}
                    onclick={() => onSelect(row.id)} ondblclick={() => rename(row)} onkeydown={event => navigate(event, row)}>
                    {#if show.code && row.code}<code class="code">{row.code}</code>{/if}
                    <span class="title">{row.title}</span>
                    {#if row.badge}<span class="badge {row.tone ?? 'default'}">{row.badge}</span>{/if}
                    {#if show.who && row.who}<span class="who">{row.who}</span>{/if}
                    {#if show.time && row.time}<time datetime={row.time}>{when(row.time)}</time>{/if}
                </button>
            {/if}
            {#if trailing}<span class="trailing">{@render trailing(row)}</span>{/if}
        </li>
    {/each}
</ul>

<style>
    .log-list { container: log-list / inline-size; display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
    .log-row { display: flex; align-items: center; min-width: 0; border-radius: var(--radius-control); }
    .log-row.selected { background: var(--selection-bg); }
    @media (hover: hover) { .log-row:not(.selected):hover { background: var(--interaction-hover); } }
    button { display: flex; flex: 1; align-items: baseline; gap: 10px; min-width: 0; min-height: 28px; padding: 4px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font: var(--font-body); text-align: start; cursor: pointer; }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .code { flex: none; color: var(--muted); font: var(--font-id); font-variant-ligatures: none; }
    .title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .selected .title { color: var(--text-strong); font-weight: var(--weight-medium); }
    .selected .code { color: var(--text); }
    /* badges read like the annotations' counts: small ink pills, quiet unless they warn */
    .badge { flex: none; align-self: center; padding: 0 6px; border-radius: 8px; background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); font: var(--weight-medium) 11px/16px var(--stack-ui); white-space: nowrap; }
    .badge.muted { background: transparent; color: var(--muted); }
    .badge.warning { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
    .who { flex: 0 1 auto; min-width: 0; max-width: 30%; overflow: hidden; color: var(--muted); font: var(--font-label); text-overflow: ellipsis; white-space: nowrap; }
    time { flex: none; color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .trailing { display: inline-flex; flex: none; padding-inline-end: 4px; }
    .rename { flex: 1; min-width: 0; min-height: 28px; margin: 0; padding: 3px 8px; font: var(--font-body); }
    @container log-list (max-width: 360px) { .who { display: none; } }
    @container log-list (max-width: 240px) { time { display: none; } }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
</style>
