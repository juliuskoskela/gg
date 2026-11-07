<script lang="ts">
    import { compactDescription } from "./format";
    import { onDestroy } from "svelte";
    import { query } from "../ipc";
    import type { RevHeader } from "../messages/RevHeader";
    import type { EvolutionEntry } from "../messages/EvolutionEntry";
    import type { EvolutionPage } from "../messages/EvolutionPage";
    import { repoConfigEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import HistoryBrowser from "./HistoryBrowser.svelte";
    import VersionPatch from "./VersionPatch.svelte";
    export let headers: RevHeader[] = [];
    export let active = true;
    let entries: EvolutionEntry[] = [];
    let selected = "";
    let loading = false;
    let error = "";
    let more = false;
    let request = 0;
    let loadedKey = "";
    $: source = headers.length === 1 ? headers[0].id : null;
    $: sourceKey = JSON.stringify([repositoryScope($repoConfigEvent), source?.commit.hex, source?.change.hex]);
    $: if (active && sourceKey !== loadedKey) { loadedKey = sourceKey; reset(); }
    $: entry = entries.find(entry => entry.revision.id.commit.hex === selected);
    $: rows = entries.map(entry => ({ id: entry.revision.id.commit.hex, title: entry.revision.description.lines[0] || "No description set", code: entry.revision.id.commit.hex.slice(0, 8), who: entry.revision.author.name, time: entry.operation?.finished_at ?? entry.revision.author.timestamp, badge: entry.revision.id.commit.hex === source?.commit.hex ? "Selected" : entry.revision.id.change.hex !== source?.change.hex ? "Contributed" : undefined, tone: entry.revision.id.commit.hex === source?.commit.hex ? "default" as const : "muted" as const }));
    onDestroy(() => request++);
    function reset(id = source, _status?: unknown, _repo?: unknown) {
        request++; entries = []; selected = ""; error = ""; more = false; loading = false;
        if (id) void load();
    }
    async function load() {
        if (!source || loading) return;
        let generation = ++request;
        loading = true; error = "";
        let result = await query<EvolutionPage>("query_evolution", { id: source, offset: entries.length });
        if (generation !== request) return;
        if (result.type === "error") error = `Couldn’t load evolution: ${result.message}`;
        else { entries = [...entries, ...result.value.entries]; more = result.value.has_more; if (!selected) selected = entries[0]?.revision.id.commit.hex ?? ""; }
        loading = false;
    }
</script>

{#if !source}
    <p class="choose-version">Select one revision to explore how its change evolved.</p>
{:else}
    <HistoryBrowser label="Evolution" caption="Earlier versions and contributions to this change. Local history may be removed by retention or garbage collection." {rows} {selected} {loading} {error} {more} onSelect={id => selected = id} onMore={load} onRefresh={() => reset()}>
        {#if entry}
            <div class="history-heading"><h2>{entry.revision.description.lines[0] || "No description set"}</h2></div>
            {#if entry.revision.description.lines.slice(1).join("\n").trim()}<p class="history-copy description">{entry.revision.description.lines.slice(1).join("\n").trim()}</p>{/if}
            <dl class="history-metadata">
                <dt>Change</dt><dd class="history-code" title={entry.revision.id.change.hex}>{entry.revision.id.change.hex.slice(0, 12)}{#if entry.revision.id.change.hex !== source.change.hex} · Contributed through a rewrite{/if}</dd>
                <dt>Commit</dt><dd class="history-code" title={selected}>{selected.slice(0, 12)}</dd>
                <dt>Author</dt><dd>{entry.revision.author.name}</dd>
                <dt>Authored</dt><dd>{new Date(entry.revision.author.timestamp).toLocaleString()}</dd>
                {#if entry.operation}<dt>Recorded</dt><dd>{new Date(entry.operation.finished_at).toLocaleString()}</dd><dt>Operation</dt><dd>{compactDescription(entry.operation.description)}</dd>{/if}
                {#if entry.predecessor_ids.length}<dt>Predecessors</dt><dd>{#each entry.predecessor_ids as id}<span class="history-code" title={id}>{id.slice(0, 8)} </span>{/each}</dd>{/if}
            </dl>
            {#if entry.revision.has_conflict}<p class="history-copy">This version contains unresolved conflicts.</p>{/if}
            {#if !entry.operation}<p class="history-copy">No earlier evolution record is retained for this version.</p>{/if}
            {#key selected}<VersionPatch id={entry.revision.id} />{/key}
        {:else if !loading && !error}<p class="history-empty">Select a version to inspect its exact patch.</p>{/if}
    </HistoryBrowser>
{/if}

<style>
    .choose-version { padding: 16px var(--panel-inset); color: var(--muted); font-size: var(--type-ui); line-height: 1.6; }
    .description { white-space: pre-wrap; }
</style>
