<script lang="ts">
    import { onDestroy } from "svelte";
    import type { RevId } from "../messages/RevId";
    import type { RevChange } from "../messages/RevChange";
    import type { RevisionDetail } from "../revision/data";
    import { loadRevisionSummary, loadRevisionDiff } from "../revision/data";
    import { repoConfigEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import DiffViewer from "../DiffViewer.svelte";
    export let id: RevId;
    let detail: RevisionDetail | null = null;
    let selected = "";
    let change: RevChange | null = null;
    let loading = true;
    let error = "";
    let request = 0;
    let fileRequest = 0;
    $: repository = repositoryScope($repoConfigEvent);
    $: load(id, repository);
    $: file = detail?.changes.find(file => file.path.repo_path === selected);
    $: loadFile(detail, file, repository);
    onDestroy(() => { request++; fileRequest++; });
    async function load(version: RevId, _repository: string) {
        let generation = ++request;
        fileRequest++; detail = null; selected = ""; change = null; loading = true; error = "";
        let result = await loadRevisionSummary({ from: version, to: version });
        if (generation !== request) return;
        if (result.type === "error") error = result.message;
        else if (result.value.type === "NotFound") error = "This version is no longer available. It may have been garbage-collected.";
        else { detail = result.value; selected = detail.changes[0]?.path.repo_path ?? ""; }
        loading = false;
    }
    async function loadFile(revision: RevisionDetail | null, file: RevChange | undefined, repository: string) {
        let generation = ++fileRequest;
        change = null;
        if (!revision || !file) return;
        let result = await loadRevisionDiff(revision, file, repository);
        if (generation !== fileRequest) return;
        if (result.type === "error") error = result.message;
        else { change = result.value; error = ""; }
    }
    async function fullFiles() {
        if (!detail || !file) throw new Error("No file selected");
        let result = await loadRevisionDiff(detail, file, repository, true);
        if (result.type !== "data" || !result.value) throw new Error(result.type === "error" ? result.message : "Version unavailable");
        let lines = result.value.hunks.flatMap(hunk => hunk.lines.lines).filter(line => !line.startsWith("\\"));
        return { before: lines.filter(line => !line.startsWith("+")).map(line => line.slice(1)).join(""), after: lines.filter(line => !line.startsWith("-")).map(line => line.slice(1)).join("") };
    }
</script>

<section class="version-patch" aria-label="Version patch">
    <h3>Version patch</h3><p class="history-copy">Changes against this version’s own parents.</p>
    {#if loading}<p role="status">Loading version…</p>
    {:else if error}<p role="alert">{error}</p><button class="history-button" type="button" on:click={() => load(id, repository)}>Retry version</button>
    {:else if detail && !detail.changes.length}<p class="history-empty">This version has no file changes.</p>
    {:else if detail}
        <label class="file-choice"><span>File</span><select aria-label="Version file" bind:value={selected}>{#each detail.changes as file}<option value={file.path.repo_path}>{file.path.relative_path}</option>{/each}</select></label>
        {#if change}{#key change}<DiffViewer {change} readingKey={`history:${repository}:${id.commit.hex}:${selected}`} loadFullFiles={fullFiles} />{/key}{:else}<p role="status">Loading file…</p>{/if}
    {/if}
</section>

<style>
    .version-patch { min-width: 0; border-block-start: 1px solid var(--rule); padding-block-start: 16px; }
    h3 { margin: 0 0 6px; font-size: var(--type-ui); font-weight: 500; }
    p { line-height: 1.6; overflow-wrap: anywhere; }
    .file-choice { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 12px; color: var(--muted); }
    select { min-width: 0; max-width: 100%; flex: 1; }
    .version-patch :global(.diff-viewer) { min-height: 80px; }
</style>
