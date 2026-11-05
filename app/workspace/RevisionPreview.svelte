<script lang="ts">
    import { repositoryScope } from "./repository";
    import { workspaceController } from "./state";
    import { shortFilename } from "../paths";
    import { loadRevisionDiff, type RevisionDetail } from "../revision/data";
    import { repoConfigEvent } from "../stores";
    import type { RevChange } from "../messages/RevChange";
    import IdSpan from "../controls/IdSpan.svelte";
    import TimestampSpan from "../controls/TimestampSpan.svelte";
    import Icon from "../controls/Icon.svelte";

    export let revs: RevisionDetail;
    export let onFull: (path?: string) => void;
    $: header = revs.headers[0];
    $: files = [...revs.changes, ...revs.conflicts.map(conflict => ({ kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] }))];
    $: additions = revs.changes.reduce((sum, file) => sum + file.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("+")).length, 0), 0);
    $: deletions = revs.changes.reduce((sum, file) => sum + file.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("-")).length, 0), 0);
    $: description = header.description.lines.slice(1).join("\n").trim();
    let preview: RevChange | null = null;
    let previewPending = false;
    let previewError = "";
    let generation = 0;
    $: loadPreview(revs, files.find(file => file.path.repo_path === $workspaceController.inspector?.activeFilePath) ?? files[0], repositoryScope($repoConfigEvent));
    async function loadPreview(detail: RevisionDetail, file: RevChange | undefined, repository: string) {
        let request = ++generation; preview = null; previewError = ""; previewPending = !!file;
        if (!file) return;
        let result = await loadRevisionDiff(detail, file, repository);
        if (request !== generation) return;
        previewPending = false;
        if (result.type === "data") preview = result.value; else previewError = result.message;
    }
    $: previewLines = preview?.hunks[0]?.lines.lines.slice(0, 6) ?? [];
    function status(file: RevChange) { return file.has_conflict ? "Conflict" : file.kind; }
</script>

<div class="revision-preview">
    <div class="identity"><span>Change <IdSpan selectable id={header.id.change} /></span><span>{header.is_working_copy ? "Working copy" : header.is_immutable ? "Immutable" : "Mutable"}</span>{#if header.has_conflict}<span class="conflict">Conflict</span>{/if}</div>
    <div class="authorship"><span>{header.author.name}</span><TimestampSpan timestamp={header.author.timestamp} /></div>
    {#if header.refs.length}<div class="references">{#each header.refs as ref}{#if ref.type === "LocalBookmark" || ref.type === "RemoteBookmark"}<span><Icon name="bookmark" />{ref.bookmark_name}{ref.type === "RemoteBookmark" ? `@${ref.remote_name}` : ""}</span>{/if}{/each}</div>{/if}
    {#if description}<details class="description"><summary>Description</summary><p>{description}</p></details>{/if}
    <div class="summary"><h3>{files.length} {files.length === 1 ? "changed file" : "changed files"}</h3>{#if !revs.summaryOnly}<span aria-label={`${additions} added lines, ${deletions} deleted lines`}><span class="added">+{additions}</span> <span class="removed">−{deletions}</span></span>{/if}</div>
    <ul class="preview-files" aria-label="Changed file preview">
        {#each files.slice(0, 5) as file}<li><button type="button" aria-label={`Inspect ${file.path.relative_path}`} on:click={() => onFull(file.path.repo_path)}><Icon name={file.has_conflict ? "alert-triangle" : "file"} /><span class="path" title={file.path.relative_path}><span class="filename">{shortFilename(file.path.relative_path)}</span><span class="directory">{file.path.relative_path.split("/").slice(0, -1).join("/")}</span></span><span class="file-status">{status(file)}</span><Icon name="chevron-right" /></button></li>{/each}
    </ul>
    {#if files.length > 5}<button class="all-files" type="button" on:click={() => onFull()}>View all {files.length} files</button>{/if}
    {#if !files.length}<p class="empty">This revision has no file changes.</p>{/if}
    {#if previewPending}<p class="empty" role="status">Loading diff preview…</p>{:else if previewError}<p class="empty">Diff preview unavailable. Open the full revision to retry.</p>{/if}
    {#if previewLines.length}<div class="diff-preview"><h3>Diff preview <span>{preview?.path.relative_path}</span></h3><pre aria-label="Diff preview">{#each previewLines as line}<code class:added={line.startsWith("+")} class:removed={line.startsWith("-")}>{line + "\n"}</code>{/each}</pre></div>{/if}
</div>

<style>
    .revision-preview { padding: 0 16px 12px; min-width: 0; font-size: var(--type-ui); pointer-events: auto; }
    .identity, .authorship, .references { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; color: var(--muted); line-height: 1.6; }
    .identity { color: var(--text); }
    .authorship { margin-block: 4px 10px; }
    .references span { display: inline-flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
    .conflict { color: var(--warning); }
    .description summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
    .description p { font-size: var(--type-body); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; margin-block-end: 12px; user-select: text; }
    .summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px 4px; }
    .summary h3, .diff-preview h3 { font-size: var(--type-ui); font-weight: 500; }
    .summary span { font-variant-numeric: tabular-nums; }
    .preview-files { list-style: none; }
    .preview-files button { display: flex; align-items: center; gap: 8px; min-height: 44px; width: 100%; padding: 8px 0; border: 0; background: transparent; color: var(--text); text-align: start; cursor: pointer; }
    .path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .filename, .directory { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .directory { font-size: var(--type-caption); color: var(--muted); }
    .file-status { font-size: var(--type-caption); color: var(--muted); }
    .all-files { min-height: 44px; border: 0; background: transparent; color: var(--accent); padding: 8px 0; cursor: pointer; }
    .empty { padding-block: 12px; color: var(--muted); }
    .diff-preview { border-block-start: 1px solid var(--rule); margin-block-start: 8px; padding-block-start: 12px; min-width: 0; }
    .diff-preview h3 { display: flex; gap: 8px; }
    .diff-preview h3 span { color: var(--muted); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    pre { margin: 8px 0 0; overflow: auto; pointer-events: auto; font-size: var(--type-code); line-height: 1.6; user-select: text; }
    .added { color: var(--positive); } .removed { color: var(--negative); }
    @media (hover: hover) { .preview-files button:hover, .all-files:hover { background: var(--hover); } }
</style>
