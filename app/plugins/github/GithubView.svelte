<script lang="ts">
    import { untrack } from "svelte";
    import type { PluginViewProps } from "../types";
    import ViewToolbar from "../../controls/ViewToolbar.svelte";
    import LogList from "../../controls/LogList.svelte";
    import MetadataList from "../../controls/MetadataList.svelte";
    import MetadataRow from "../../controls/MetadataRow.svelte";
    import { controllers } from "./controller";
    import { scope, verify } from "./model";
    let { api }: PluginViewProps = $props();
    let controller = untrack(() => controllers.get(api))!;
    let data = controller.state;
    let editing = $state(false), owner = $state(""), repo = $state(""), reviewer = $state(""), enabled = $state(false), error = $state("");
    let selected = $state<number | null>(null), showAll = $state(false);
    let entry = $derived($data.cache?.entries.find(item => item.pull.number === selected));
    let mapping = $derived($data.mappings.find(item => item.scope === $data.cache?.scope && item.number === selected));
    let status = $derived(entry && mapping ? verify(mapping, entry.pull, mapping.changes.map(change => $data.current.get(change.changeId) ?? null)) : null);
    let entries = $derived(($data.cache?.entries ?? []).filter(entry => showAll || !$data.config?.reviewer || entry.pull.requested_reviewers.some(login => login.toLowerCase() === $data.config!.reviewer.toLowerCase())));
    let rows = $derived(entries.map(entry => ({ id: String(entry.pull.number), title: `#${entry.pull.number} ${entry.pull.title}`, who: entry.pull.author, time: entry.pull.updated_at, badge: entry.pull.merged ? "Merged" : entry.pull.draft ? "Draft" : entry.pull.state === "closed" ? "Closed" : "Open" })));
    async function run(action: () => Promise<unknown>) { error = ""; try { await action(); } catch (problem) { error = String(problem); } }
    function settings() { let config = $data.config; owner = config?.owner ?? ""; repo = config?.repo ?? ""; reviewer = config?.reviewer ?? ""; enabled = config?.enabled ?? false; editing = true; }
</script>
<ViewToolbar label="Public GitHub tools">
    <span class="toolbar-lead">Public GitHub</span>
    <button type="button" onclick={settings}>Settings</button>
    <button type="button" disabled={!$data.config?.enabled || $data.busy || Date.now() < $data.retryAt} onclick={() => run(controller.refresh)}>{$data.busy ? "Refreshing…" : "Refresh"}</button>
</ViewToolbar>
<section class="github-view" aria-label="Public GitHub pull requests">
    {#if !$data.ready}<p>Loading local cache…</p>{:else}
    {#if editing || !$data.config}
        <form onsubmit={event => { event.preventDefault(); run(async () => { await controller.configure({ owner: owner.trim(), repo: repo.trim(), reviewer: reviewer.trim(), enabled }); editing = false; selected = null; }); }}>
            <p>Read public pull requests from one GitHub repository. This sends the repository name and your network address to GitHub. No credentials, comments or local code are sent.</p>
            <label>Owner<input required maxlength="100" bind:value={owner} /></label>
            <label>Repository<input required maxlength="100" bind:value={repo} /></label>
            <label>Reviewer login (optional)<input maxlength="100" bind:value={reviewer} /></label>
            <label class="check"><input type="checkbox" bind:checked={enabled} />Allow public reads from api.github.com every 15 minutes</label>
            <div class="actions"><button type="submit">Save settings</button>{#if $data.config}<button type="button" onclick={() => editing = false}>Cancel</button>{/if}</div>
        </form>
    {/if}
    {#if error || $data.error}<p role="alert">{error || $data.error}</p>{/if}
    {#if $data.config}
        <p class="muted">{scope($data.config)} · {$data.config.enabled ? "Public reads enabled" : "Public reads paused"}</p>
        {#if $data.cache?.checkedAt}<p class="muted">Cache checked {new Date($data.cache.checkedAt).toLocaleString()}. {Date.now() - $data.cache.checkedAt > 30 * 60 * 1000 ? "This cache is stale." : "Remote changes may have happened since then."}</p>{:else}<p>No public data has been cached yet.</p>{/if}
        {#if $data.cache?.partial}<p role="status">Partial list: only the first 300 open pull requests were read. Mapped pulls absent from the list are checked separately, up to two per refresh.</p>{/if}
        {#if $data.config.reviewer}<label class="check"><input type="checkbox" bind:checked={showAll} />Show all cached pulls, including those not requesting {$data.config.reviewer}</label>{/if}
        {#if rows.length}<LogList {rows} label="Cached pull requests" selected={selected === null ? undefined : String(selected)} onSelect={id => selected = Number(id)} columns={{ code: false, who: true, time: true }} />{:else if $data.cache}<p>No cached pulls match this filter. This is not a live inbox.</p>{/if}
        {#if entry}
            <section aria-label="Cached pull request" class="detail">
                <h3>#{entry.pull.number} {entry.pull.title}</h3>
                <MetadataList label="Public pull request details">
                    <MetadataRow label="State">{entry.pull.merged ? "Merged" : entry.pull.state}{entry.pull.draft ? " · Draft" : ""}</MetadataRow>
                    <MetadataRow label="Checked">{new Date(entry.checkedAt).toLocaleString()}{Date.now() - entry.checkedAt > 30 * 60 * 1000 ? " · stale" : ""}</MetadataRow>
                    <MetadataRow label="Head"><code>{entry.pull.head_sha}</code></MetadataRow>
                    <MetadataRow label="Review requested">{entry.pull.requested_reviewers.join(", ") || "None recorded"}</MetadataRow>
                </MetadataList>
                <p><a class="text-link" href={`https://github.com/${encodeURIComponent($data.config.owner)}/${encodeURIComponent($data.config.repo)}/pull/${entry.pull.number}`} target="_blank" rel="noopener noreferrer">Open on GitHub</a></p>
                <p>This view reads public metadata. It does not fetch commits, import discussions, submit verdicts or change GitHub.</p>
                <div class="actions"><button type="button" onclick={() => run(() => controller.map(entry!.pull.number))}>Map selected local changes</button>{#if mapping}<button type="button" onclick={() => run(() => controller.unmap(entry!.pull.number))}>Remove mapping</button>{/if}</div>
                {#if mapping}
                    <p role="status">{status === "verified" ? "Exact cached head matched the selected local versions." : status === "remote-changed" ? "The cached remote head changed. Check the new code and map it again." : status === "rewritten" ? "Mapped local changes were rewritten. Check and map the new versions." : "Mapped local versions are unavailable. This mapping is unverified."}</p>
                    {#each mapping.changes as change (change.changeId)}<p><code>{change.changeId}</code> <button type="button" disabled={!$data.current.get(change.changeId)} onclick={() => run(() => api.navigation.select($data.current.get(change.changeId)!.id))}>Open local change</button></p>{/each}
                {:else}<p class="muted">Select changes containing this exact head commit in GG before mapping. Titles and branch names are never used to guess a match.</p>{/if}
            </section>
        {/if}
    {/if}
    {/if}
</section>
<style>
    @import "../../controls/action.css";
    .github-view { padding: var(--panel-inset); display: grid; align-content: start; gap: var(--gap-group); min-width: 0; }
    form, .detail { display: grid; gap: var(--gap-row); }
    .detail { border-block-start: 1px solid var(--rule); padding-block-start: var(--space-4); }
    label { display: grid; gap: var(--gap-row); font: var(--font-label); }
    input { min-width: 0; width: 100%; box-sizing: border-box; }
    .check { display: flex; align-items: start; gap: var(--gap-row); }
    .check input { width: auto; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--gap-row); }
    p, h3 { margin: 0; overflow-wrap: anywhere; }
    h3 { font: var(--font-heading); }
    code { font: var(--font-id); overflow-wrap: anywhere; }
    .muted { color: var(--muted); }
</style>
