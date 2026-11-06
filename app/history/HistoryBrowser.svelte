<script lang="ts">
    import "./history.css";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    export let label: string;
    export let caption: string;
    export let rows: { id: string; title: string; subtitle: string; time: string; badge?: string }[] = [];
    export let selected = "";
    export let loading = false;
    export let error = "";
    export let more = false;
    export let onSelect: (id: string) => void;
    export let onMore: () => void;
    export let onRefresh: () => void;
    function navigate(event: KeyboardEvent) {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        let buttons = [...(event.currentTarget as HTMLElement).closest(".history-rows")!.querySelectorAll<HTMLButtonElement>("button[data-history-row]")];
        let index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        let next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        buttons[next]?.focus(); buttons[next]?.click();
    }
</script>

<ViewToolbar label={`${label} tools`}><ActionWidget safe tip={`Refresh ${label.toLowerCase()}`} disabled={loading} onClick={onRefresh}><Icon name="refresh-cw" />Refresh</ActionWidget></ViewToolbar>

<section class="history-browser" aria-label={label}>
    <header class="history-intro"><p>{caption}</p></header>
    <div class="history-layout">
        <div class="history-index">
            <div class="history-rows" role="group" aria-label={`${label} entries`}>
                {#each rows as row (row.id)}
                    <button data-history-row type="button" on:keydown={navigate} class="history-row" aria-pressed={selected === row.id} on:click={() => onSelect(row.id)}>
                        <span class="row-heading"><span class="row-title">{row.title}</span>{#if row.badge}<span class="row-badge">{row.badge}</span>{/if}</span>
                        <span class="row-meta"><span>{row.subtitle}</span><time datetime={row.time} title={new Date(row.time).toLocaleString()}>{new Date(row.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
                    </button>
                {/each}
            </div>
            {#if loading}<p class="history-state" role="status">Loading history…</p>{/if}
            {#if error}<div class="history-state" role="alert"><p>{error}</p><button type="button" on:click={rows.length ? onMore : onRefresh}>Try again</button></div>{/if}
            {#if !loading && !error && !rows.length}<p class="history-state">No retained history is available.</p>{/if}
            {#if more}<button class="load-more" type="button" disabled={loading} on:click={onMore}>Load earlier entries</button>{/if}
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (historical details scroll independently) -->
        <div class="history-detail" role="region" aria-label={`${label} detail`} tabindex="0"><slot /></div>
    </div>
</section>

<style>
    .history-browser { container: history / inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; color: var(--text); background: var(--surface); font-size: var(--type-ui); }
    /* the caption introduces the content below it; a rule would make it a third header band */
    .history-intro { display: flex; align-items: start; gap: 12px; padding: 10px var(--panel-inset) 4px; }
    .history-intro p { flex: 1; margin: 0; color: var(--muted); font-size: var(--type-caption); line-height: 1.6; }
    button { color: var(--text); background: transparent; border: 0; border-radius: var(--radius-control); cursor: pointer; font-size: inherit; }
    button:disabled { cursor: default; color: var(--text-disabled); }
    .history-layout { display: grid; grid-template-columns: minmax(220px, 34%) minmax(0, 1fr); flex: 1; min-height: 0; }
    .history-index { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 6px; border-inline-end: 1px solid var(--rule); }
    .history-rows { display: grid; gap: 2px; }
    .history-row { display: grid; gap: 7px; width: 100%; min-height: 64px; padding: 10px; text-align: start; }
    .row-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-badge { flex-shrink: 0; color: var(--muted); font-size: var(--type-caption); }
    .row-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-size: var(--type-caption); }
    .row-meta > span { overflow-wrap: anywhere; }
    .history-row[aria-pressed="true"] { background: var(--interaction-selected); }
    .history-row[aria-pressed="true"] .row-title { font-weight: 500; }
    .history-row[aria-pressed="true"] .row-meta, .history-row[aria-pressed="true"] .row-badge { color: var(--text); }
    .history-state { padding: 10px; margin: 0; color: var(--muted); line-height: 1.6; overflow-wrap: anywhere; }
    .history-state p { margin: 0 0 8px; }
    .load-more, .history-state button { min-height: 36px; padding: 8px 10px; text-align: start; }
    .load-more { width: 100%; color: var(--muted); margin-block-start: 6px; }
    .history-detail { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 18px var(--panel-inset) 24px; scroll-padding: 16px; }
    @container history (max-width: 650px) { .history-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(100px, 38%) minmax(0, 1fr); } .history-index { border-inline-end: 0; border-block-end: 1px solid var(--rule); } }
    @media (hover: hover) { button:not(:disabled):hover { background: var(--interaction-hover); } .history-row[aria-pressed="true"]:hover { background: var(--interaction-selected-hover); } }
    button:not(:disabled):active { background: var(--interaction-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .load-more, .history-state button { min-height: 44px; } }
</style>
