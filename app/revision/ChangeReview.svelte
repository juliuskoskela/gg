<script lang="ts">
    import { untrack } from "svelte";
    import type { RevHeader } from "../messages/RevHeader";
    import type { Query } from "../ipc";
    import type { RevsResult } from "../messages/RevsResult";
    import { loadRevisionSummary } from "./data";
    import RevisionChanges from "./RevisionChanges.svelte";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import type { RevChange } from "../messages/RevChange";
    import OriginLink from "./OriginLink.svelte";
    let { header, initialOpen = false }: { header: RevHeader; initialOpen?: boolean } = $props();
    let expanded = $state(untrack(() => initialOpen));
    let result = $state.raw<Query<RevsResult>>({ type: "wait" });
    let selectedPath = $state("");
    let detail = $derived(result.type === "data" && result.value.type === "Detail" ? result.value : null);
    let changes: RevChange[] = $derived(detail ? [...detail.changes, ...detail.conflicts.map(conflict => ({ kind: "None" as const, category: conflict.category, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] }))] : []);
    $effect.pre(() => {
        let files = changes;
        untrack(() => { if (!files.some(file => file.path.repo_path === selectedPath)) selectedPath = files[0]?.path.repo_path ?? ""; });
    });
    $effect(() => {
        let id = header.id, open = expanded;
        if (!open) return;
        let current = true;
        result = { type: "wait" };
        untrack(() => loadRevisionSummary({ from: id, to: id })).then(value => { if (current) result = value; });
        return () => { current = false; };
    });
</script>
<details bind:open={expanded}>
    <summary><span>{header.id.change.prefix}</span> {header.description.lines[0] || "(no description set)"}</summary>
    {#if expanded}
        <div class="single-review">
            {#if result.type === "wait"}<p role="status">Loading change…</p>
            {:else if result.type === "error"}<p role="alert">{result.message}</p>
            {:else if detail}
                <ViewToolbar label="Selected change files"><SelectWidget label={`File in ${header.id.change.hex.slice(0, 8)}`} options={changes.map(change => ({ value: change.path.repo_path }))} bind:value={selectedPath} /></ViewToolbar>
                <RevisionChanges revs={detail} {changes} {selectedPath} onSelectFile={file => selectedPath = file.path.repo_path} />
            {:else}<p>This revision is no longer available.</p>{/if}
        </div>
        <div class="change-link"><OriginLink origin={header.id} path={selectedPath} /></div>
    {/if}
</details>
<style>
    details { border-block-end: 1px solid var(--rule); }
    summary { pointer-events: auto; cursor: pointer; padding: var(--panel-inset); font: var(--font-body); }
    summary span { font: var(--font-id); margin-inline-end: var(--space-2); }
    .single-review { height: 70vh; display: flex; flex-direction: column; min-height: 0; }
    .single-review :global(.changes-module) { flex: 1; }
    .change-link { padding: var(--panel-inset); }
    p { padding: var(--panel-inset); }
</style>
