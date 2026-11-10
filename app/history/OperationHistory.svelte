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
    import RevisionLines from "./RevisionLines.svelte";
    import RefLine from "./RefLine.svelte";
    import DetailHeader from "./DetailHeader.svelte";
    import { operationKind } from "./operationKind";
    import SectionHeading from "../controls/SectionHeading.svelte";
    import MetadataList from "../controls/MetadataList.svelte";
    import MetadataRow from "../controls/MetadataRow.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
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
    let available = (id: string) => !!detail?.revisions.some(revision => revision.id.commit.hex === id);
    let rows = $derived(entries.map(entry => ({ id: entry.id, title: compactDescription(entry.description) || "Repository initialized", code: entry.id.slice(0, 8), who: entry.workspace || entry.username || "Repository", time: entry.finished_at, kind: operationKind(entry.description), badge: entry.id === head ? (updated ? "At refresh" : "Latest") : entry.parent_ids.length > 1 ? "Concurrent merge" : undefined, tone: entry.id === head ? "default" as const : entry.parent_ids.length > 1 ? "warning" as const : "muted" as const })));
</script>

<HistoryBrowser label="Repository history" caption={updated ? "Repository changed. Refresh to see new operations; your historical selection stays available." : "Explore past repository states without changing your working copy. Operations are local and subject to retention and garbage collection."} {rows} {selected} {loading} {error} {more} onSelect={id => selected = id} onMore={load} onRefresh={() => reset()}>
    {#if detailLoading}<p class="history-empty" role="status">Loading repository state…</p>
    {:else if detailError}<p class="history-copy" role="alert">{detailError}</p><div><ActionWidget safe tip="Retry operation" onClick={() => loadDetail(selected)}>Retry operation</ActionWidget></div>
    {:else if detail}
        <DetailHeader title={compactDescription(detail.operation.description) || "Repository initialized"} pills={[selected === head && !updated ? { label: "Latest" } : { label: "Historical" }, { label: "Read only", tone: "muted" }]} />
        <MetadataList label="Operation metadata">
            <MetadataRow label="Operation"><span class="history-code" title={detail.operation.id}>{detail.operation.id.slice(0, 12)}</span></MetadataRow>
            <MetadataRow label="Recorded">{new Date(detail.operation.finished_at).toLocaleString()}</MetadataRow>
            <MetadataRow label="By">{detail.operation.username || "Unknown user"}{#if detail.operation.hostname} on {detail.operation.hostname}{/if}</MetadataRow>
            {#if detail.operation.workspace}<MetadataRow label="Workspace">{detail.operation.workspace}</MetadataRow>{/if}
            {#each detail.parents as parent}<MetadataRow label="Previous"><button class="text-link" title={parent.description} type="button" onclick={() => selected = parent.id}><span class="history-code">{parent.id.slice(0, 8)}</span> {compactDescription(parent.description) || "Repository initialized"}</button></MetadataRow>{/each}
        </MetadataList>
        {#if version}
            {#key version.id.commit.hex}<VersionPatch id={version.id} title={version.description.lines[0] || "No description set"}>{#snippet actions()}<ActionWidget safe tip="Back to state" onClick={() => version = null}>Back to state</ActionWidget>{/snippet}</VersionPatch>{/key}
        {:else}
            <section class="history-section" aria-label="Historical workspaces"><SectionHeading title="Working copies" count={detail.workspaces.length} />
                {#if detail.workspaces.length}<div role="list" aria-label="Working copies">{#each detail.workspaces as workspace}<RefLine kind="workspace" name={workspace.name} ids={[workspace.commit_id]} available={available} onInspect={inspectCommit} />{/each}</div>
                {:else}<p class="history-empty">No working copies recorded.</p>{/if}
            </section>
            <section class="history-section" aria-label="Historical bookmarks"><SectionHeading title="Bookmarks" count={detail.bookmarks.length} />
                {#if detail.bookmarks.length}<div role="list" aria-label="Bookmarks">{#each detail.bookmarks as bookmark}<RefLine kind="bookmark" name={bookmark.name} ids={bookmark.added_ids} removed={bookmark.removed_ids} conflicted={bookmark.has_conflict} available={available} onInspect={inspectCommit} />{/each}</div>
                {:else}<p class="history-empty">No local bookmarks recorded.</p>{/if}
            </section>
            <section class="history-section" aria-label="Historical graph"><SectionHeading title="Revision graph" count={`${detail.revisions.length}${detail.has_more_revisions ? "+" : ""}`} /><p class="history-copy">Select a revision to inspect its patch at this moment.</p>
                <RevisionLines revisions={detail.revisions} heads={detail.heads} onSelect={revision => version = revision} />
                {#if detail.has_more_revisions}<p class="history-copy">Showing the newest 60 revisions in this repository state.</p>{/if}
            </section>
        {/if}
    {:else if !loading && !error}<p class="history-empty">Select an operation to explore the repository at that moment.</p>{/if}
</HistoryBrowser>
