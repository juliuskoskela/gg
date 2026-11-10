<script lang="ts">
    import type { Snippet } from "svelte";
    import "./history.css";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import LogList, { type LogEntry } from "../controls/LogList.svelte";
    interface Props {
        label: string;
        caption: string;
        rows?: LogEntry[];
        selected?: string;
        loading?: boolean;
        error?: string;
        more?: boolean;
        onSelect: (id: string) => void;
        onMore: () => void;
        onRefresh: () => void;
        children?: Snippet;
    }

    let {
        label,
        caption,
        rows = [],
        selected = "",
        loading = false,
        error = "",
        more = false,
        onSelect,
        onMore,
        onRefresh,
        children
    }: Props = $props();
</script>

<ViewToolbar label={`${label} tools`}><ActionWidget safe tip={`Refresh ${label.toLowerCase()}`} disabled={loading} onClick={onRefresh}><Icon name="refresh-cw" />Refresh</ActionWidget></ViewToolbar>

<section class="history-browser" aria-label={label}>
    <header class="history-intro"><p>{caption}</p></header>
    <div class="history-layout">
        <div class="history-index">
            <LogList {rows} {selected} {onSelect} label={`${label} entries`} />
            {#if loading}<p class="history-state" role="status">Loading history…</p>{/if}
            {#if error}<div class="history-state" role="alert"><p>{error}</p><ActionWidget safe tip="Try again" onClick={rows.length ? onMore : onRefresh}>Try again</ActionWidget></div>{/if}
            {#if !loading && !error && !rows.length}<p class="history-state">No retained history is available.</p>{/if}
            {#if more}<div class="load-more"><ActionWidget safe tip="Load earlier entries" disabled={loading} onClick={onMore}>Load earlier entries</ActionWidget></div>{/if}
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (historical details scroll independently) -->
        <div class="history-detail" role="region" aria-label={`${label} detail`} tabindex="0">{@render children?.()}</div>
    </div>
</section>

<style>
    .history-browser { container: history / inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; color: var(--text); background: var(--surface); font: var(--font-body); }
    /* the caption introduces the content below it; a rule would make it a third header band */
    .history-intro { padding: var(--space-2) var(--panel-inset); }
    .history-intro p { max-width: var(--prose-measure); margin: 0; color: var(--muted); font: var(--font-label); }
    .history-layout { display: grid; grid-template-columns: minmax(220px, 34%) minmax(0, 1fr); flex: 1; min-height: 0; }
    .history-index { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--space-1); border-inline-end: 1px solid var(--view-inner-rule); }
    .history-state { padding: var(--space-1) var(--space-2); margin: 0; color: var(--muted); font: var(--font-body); overflow-wrap: anywhere; }
    .history-state p { margin: 0 0 var(--space-2); }
    .load-more { margin-block-start: var(--space-1); }
    .history-detail { pointer-events: auto; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--space-4) var(--panel-inset) var(--space-5); scroll-padding: var(--space-4); }
    @container history (max-width: 650px) { .history-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(100px, 38%) minmax(0, 1fr); } .history-index { border-inline-end: 0; border-block-end: 1px solid var(--view-inner-rule); } }
</style>
