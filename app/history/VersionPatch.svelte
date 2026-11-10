<script lang="ts">
    import { untrack } from "svelte";

    import { onDestroy } from "svelte";
    import type { RevId } from "../messages/RevId";
    import type { RevChange } from "../messages/RevChange";
    import type { RevisionDetail } from "../revision/data";
    import { loadRevisionSummary, loadRevisionDiff } from "../revision/data";
    import { repoConfigEvent } from "../stores";
    import { repositoryScope } from "../workspace/repository";
    import DiffViewer from "../DiffViewer.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import SectionHeading from "../controls/SectionHeading.svelte";
    import type { Snippet } from "svelte";
    interface Props {
        id: RevId;
        title?: string;
        /** controls for the section heading's trailing edge */
        actions?: Snippet | undefined;
    }

    let { id, title = "Version patch", actions = undefined }: Props = $props();
    let detail: RevisionDetail | null = $state.raw(null);
    let selected = $state("");
    let change: RevChange | null = $state.raw(null);
    let loading = $state(true);
    let error = $state("");
    let request = 0;
    let fileRequest = 0;
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
    let repository = $derived(repositoryScope($repoConfigEvent));
    $effect.pre(() => {
        let version = id, scope = repository;
        untrack(() => load(version, scope));
    });
    let file = $derived.by(() => detail?.changes.find(file => file.path.repo_path === selected));
    $effect.pre(() => {
        let revision = detail, selectedFile = file, scope = repository;
        untrack(() => loadFile(revision, selectedFile, scope));
    });
</script>

<section class="history-section version-patch" aria-label="Version patch">
    <SectionHeading {title} {actions} />
    {#if loading}<p class="history-empty" role="status">Loading version…</p>
    {:else if error}<p class="history-copy" role="alert">{error}</p><div><ActionWidget safe tip="Retry version" onClick={() => load(id, repository)}>Retry version</ActionWidget></div>
    {:else if detail && !detail.changes.length}<p class="history-empty">This version has no file changes.</p>
    {:else if detail}
        <label class="file-choice"><span>File</span><select aria-label="Version file" bind:value={selected}>{#each detail.changes as file}<option value={file.path.repo_path}>{file.path.relative_path}</option>{/each}</select></label>
        {#if change}{#key change}<DiffViewer {change} readingKey={`history:${repository}:${id.commit.hex}:${selected}`} loadFullFiles={fullFiles} />{/key}{:else}<p class="history-empty" role="status">Loading file…</p>{/if}
    {/if}
</section>

<style>
    .file-choice { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
    .file-choice span { flex: none; color: var(--muted); font: var(--font-label); }
    select { flex: 1; min-width: 0; max-width: 100%; }
    .version-patch :global(.diff-viewer) { min-height: 80px; }
</style>
