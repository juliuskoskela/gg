<script lang="ts">
    import "./history.css";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import LogList, { type LogEntry } from "../controls/LogList.svelte";
    export let label: string;
    export let caption: string;
    export let rows: LogEntry[] = [];
    export let selected = "";
    export let loading = false;
    export let error = "";
    export let more = false;
    export let onSelect: (id: string) => void;
    export let onMore: () => void;
    export let onRefresh: () => void;
</script>

<ViewToolbar label={`${label} tools`}><ActionWidget safe tip={`Refresh ${label.toLowerCase()}`} disabled={loading} onClick={onRefresh}><Icon name="refresh-cw" />Refresh</ActionWidget></ViewToolbar>

<section class="history-browser" aria-label={label}>
    <header class="history-intro"><p>{caption}</p></header>
    <div class="history-layout">
        <div class="history-index">
            <LogList {rows} {selected} {onSelect} label={`${label} entries`} />
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
    .history-intro p { flex: 1; max-width: var(--prose-measure); margin: 0; color: var(--muted); font: var(--font-label); }
    button { color: var(--text); background: transparent; border: 0; border-radius: var(--radius-control); cursor: pointer; font-size: inherit; }
    button:disabled { cursor: default; color: var(--text-disabled); }
    .history-layout { display: grid; grid-template-columns: minmax(220px, 34%) minmax(0, 1fr); flex: 1; min-height: 0; }
    .history-index { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 6px; border-inline-end: 1px solid var(--rule); }
    .history-state { padding: 10px; margin: 0; color: var(--muted); font: var(--font-body); overflow-wrap: anywhere; }
    .history-state p { margin: 0 0 8px; }
    .load-more, .history-state button { min-height: 36px; padding: 8px 10px; text-align: start; }
    .load-more { width: 100%; color: var(--muted); margin-block-start: 6px; }
    .history-detail { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 18px var(--panel-inset) 24px; scroll-padding: 16px; }
    @container history (max-width: 650px) { .history-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(100px, 38%) minmax(0, 1fr); } .history-index { border-inline-end: 0; border-block-end: 1px solid var(--rule); } }
    @media (hover: hover) { button:not(:disabled):hover { background: var(--interaction-hover); } }
    button:not(:disabled):active { background: var(--interaction-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .load-more, .history-state button { min-height: 44px; } }
</style>
