<script lang="ts">
    import { untrack } from "svelte";

    import { compactDescription } from "./format";
    import { onDestroy } from "svelte";
    import { query } from "../ipc";
    import type { OperationPage } from "../messages/OperationPage";
    import type { OperationRecord } from "../messages/OperationRecord";
    import type { OperationDetail } from "../messages/OperationDetail";
    import type { HistoryRevision } from "../messages/HistoryRevision";
    import { repoConfigEvent, repoStatusEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import HistoryBrowser from "./HistoryBrowser.svelte";
    import SnapshotGraph from "./SnapshotGraph.svelte";
    import VersionPatch from "./VersionPatch.svelte";
    interface Props {
        active?: boolean;
    }

    let { active = true }: Props = $props();
    let entries: OperationRecord[] = $state.raw([]);
    let selected = $state("");
    let head = $state("");
    let loading = $state(false);
    let error = $state("");
    let more = $state(false);
    let request = 0;
    let detailRequest = 0;
    let detail: OperationDetail | null = $state.raw(null);
    let detailError = $state("");
    let detailLoading = $state(false);
    let version: HistoryRevision | null = $state.raw(null);
    let loadedRepository: string | null = $state(null);
    let lastStatus: unknown = $state.raw();
    let updated = $state(false);
    onDestroy(() => { request++; detailRequest++; });
    function reset(_repo?: unknown, _status?: unknown) {
        updated = false; request++; detailRequest++; entries = []; selected = ""; head = ""; more = false; loading = false; error = ""; detail = null; version = null;
        void load();
    }
    async function load() {
        if (loading) return;
        let generation = ++request;
        loading = true; error = "";
        let result = await query<OperationPage>("query_operation_history", { head: head || null, offset: entries.length });
        if (generation !== request) return;
        if (result.type === "error") error = `Couldn’t load repository history: ${result.message}`;
        else { head = result.value.head_id; entries = [...entries, ...result.value.entries]; more = result.value.has_more; if (!selected) selected = entries[0]?.id ?? ""; }
        loading = false;
    }
    async function loadDetail(id: string) {
        let generation = ++detailRequest;
        detail = null; version = null; detailError = ""; detailLoading = !!id;
        if (!id) return;
        let result = await query<OperationDetail>("query_operation_detail", { id });
        if (generation !== detailRequest) return;
        if (result.type === "error") detailError = `Couldn’t inspect this operation: ${result.message}`;
        else detail = result.value;
        detailLoading = false;
    }
    function inspectCommit(id: string) { version = detail?.revisions.find(revision => revision.id.commit.hex === id) ?? null; }
    let repository = $derived(repositoryScope($repoConfigEvent));
    $effect.pre(() => {
        let scope = repository, enabled = active;
        untrack(() => { if (enabled && scope !== loadedRepository) { loadedRepository = scope; reset(); } });
    });
    $effect.pre(() => {
        let status = $repoStatusEvent;
        untrack(() => { if (status !== lastStatus) { if (lastStatus !== undefined && head) updated = true; lastStatus = status; } });
    });
    $effect.pre(() => {
        let id = selected;
        untrack(() => loadDetail(id));
    });
    let rows = $derived(entries.map(entry => ({ id: entry.id, title: compactDescription(entry.description) || "Repository initialized", code: entry.id.slice(0, 8), who: entry.workspace || entry.username || "Repository", time: entry.finished_at, badge: entry.id === head ? (updated ? "At refresh" : "Latest") : entry.parent_ids.length > 1 ? "Concurrent merge" : entry.is_snapshot ? "Snapshot" : undefined, tone: entry.id === head ? "default" as const : entry.parent_ids.length > 1 ? "warning" as const : "muted" as const })));
</script>

<HistoryBrowser label="Repository history" caption={updated ? "Repository changed. Refresh to see new operations; your historical selection stays available." : "Explore past repository states without changing your working copy. Operations are local and subject to retention and garbage collection."} {rows} {selected} {loading} {error} {more} onSelect={id => selected = id} onMore={load} onRefresh={() => reset()}>
    {#if detailLoading}<p class="history-empty" role="status">Loading repository state…</p>
    {:else if detailError}<p class="history-copy" role="alert">{detailError}</p><button class="history-button" type="button" onclick={() => loadDetail(selected)}>Retry operation</button>
    {:else if detail}
        <div class="history-heading"><h2>{compactDescription(detail.operation.description) || "Repository initialized"}</h2></div>
        <p class="history-copy">{selected === head && !updated ? "Latest repository state" : "Historical repository state"} · Read only</p>
        <dl class="history-metadata">
            <dt>Operation</dt><dd class="history-code" title={detail.operation.id}>{detail.operation.id.slice(0, 12)}</dd>
            <dt>Recorded</dt><dd>{new Date(detail.operation.finished_at).toLocaleString()}</dd>
            <dt>By</dt><dd>{detail.operation.username || "Unknown user"}{#if detail.operation.hostname} on {detail.operation.hostname}{/if}</dd>
            {#if detail.operation.workspace}<dt>Workspace</dt><dd>{detail.operation.workspace}</dd>{/if}
            {#if detail.parents.length}<dt>Previous</dt><dd>{#each detail.parents as parent}<button class="history-link" title={parent.description} type="button" onclick={() => selected = parent.id}>{parent.id.slice(0, 8)} · {compactDescription(parent.description) || "Repository initialized"}</button>{/each}</dd>{/if}
        </dl>
        {#if version}
            <div class="patch-title"><h3>{version.description.lines[0] || "No description set"}</h3><button class="history-button" type="button" onclick={() => version = null}>Back to state</button></div>
            {#key version.id.commit.hex}<VersionPatch id={version.id} />{/key}
        {:else}
            <section class="history-section" aria-label="Historical workspaces"><h3>Working copies <span>{detail.workspaces.length}</span></h3>
                {#each detail.workspaces as workspace}<div class="state-ref"><span>{workspace.name}</span><button class="history-link history-code" type="button" title={workspace.commit_id} onclick={() => inspectCommit(workspace.commit_id)} disabled={!detail.revisions.some(revision => revision.id.commit.hex === workspace.commit_id)}>{workspace.commit_id.slice(0, 8)}</button></div>{:else}<p class="history-empty">No working copies recorded.</p>{/each}
            </section>
            <section class="history-section" aria-label="Historical bookmarks"><h3>Bookmarks <span>{detail.bookmarks.length}</span></h3>
                {#each detail.bookmarks as bookmark}<div class="state-ref"><span>{bookmark.name}{#if bookmark.has_conflict}<small>Conflicted target</small>{/if}</span><span>{#each bookmark.added_ids as id}<button class="history-link history-code" type="button" title={id} onclick={() => inspectCommit(id)} disabled={!detail.revisions.some(revision => revision.id.commit.hex === id)}>{id.slice(0, 8)}</button>{/each}{#if bookmark.removed_ids.length}<small>Removed: {bookmark.removed_ids.map(id => id.slice(0, 8)).join(", ")}</small>{/if}</span></div>{:else}<p class="history-empty">No local bookmarks recorded.</p>{/each}
            </section>
            <section class="history-section" aria-label="Historical graph"><h3>Revision graph <span>{detail.revisions.length}{detail.has_more_revisions ? "+" : ""}</span></h3><p class="history-copy">Select a revision to inspect its patch at this moment.</p>
                <SnapshotGraph revisions={detail.revisions} heads={detail.heads} onSelect={revision => version = revision} />
                {#if detail.has_more_revisions}<p class="history-copy">Showing the newest 60 revisions in this repository state.</p>{/if}
            </section>
        {/if}
    {:else if !loading && !error}<p class="history-empty">Select an operation to explore the repository at that moment.</p>{/if}
</HistoryBrowser>

<style>
    h3 span { color: var(--muted); font-weight: 400; margin-inline-start: 6px; }
    .state-ref { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; min-height: 34px; padding-block: 3px; }
    .state-ref > span { min-width: 0; overflow-wrap: anywhere; }
    small { display: block; color: var(--muted); font-size: var(--type-caption); }
    .patch-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; }
    .patch-title h3 { font-size: var(--type-ui); font-weight: 500; }
    .history-link:disabled { color: var(--muted); cursor: default; }
</style>
