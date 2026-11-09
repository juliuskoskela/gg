<script lang="ts">
    import { untrack } from "svelte";
    import DiffViewer from "../../DiffViewer.svelte";
    import CapturedDiscussion from "./CapturedDiscussion.svelte";
    import MetadataList from "../../controls/MetadataList.svelte";
    import MetadataRow from "../../controls/MetadataRow.svelte";
    import SelectWidget from "../../controls/SelectWidget.svelte";
    import type { RevChange } from "../../messages/RevChange";
    import { snapshotTitle, type ReviewSnapshot } from "./snapshot";
    let { snapshot }: { snapshot: ReviewSnapshot } = $props();
    let memberIndex = $state(0);
    let selectedPath = $state("");
    let identity = $state(untrack(() => snapshot.id));
    $effect.pre(() => { let id = snapshot.id; if (id !== identity) { identity = id; memberIndex = 0; selectedPath = ""; } });
    let captured = $derived(snapshot.version === 2 ? snapshot.members[memberIndex] : null);
    let files: RevChange[] = $derived(snapshot.version === 1 ? snapshot.snapshot.files.map(file => file.change) : captured?.state === "captured" ? [
        ...captured.detail.changes,
        ...captured.detail.conflicts.filter(conflict => !captured.detail.changes.some(file => file.path.repo_path === conflict.path.repo_path)).map(conflict => ({ kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] })),
    ] : []);
    let file = $derived(files.find(file => file.path.repo_path === selectedPath) ?? files[0]);
    let notes = $derived(snapshot.version === 2 ? snapshot.capturedNotes.threads : []);
    let marks = $derived(snapshot.version === 2 ? snapshot.members.reduce((sum, capture) => {
        if (capture.state !== "captured") return sum;
        let row = snapshot.version === 2 ? snapshot.capturedMarks.changes.find(row => row.change_id === capture.member.changeId && row.commit_id === capture.member.commitId) : undefined;
        return { reviewed: sum.reviewed + (row?.reviewed ?? 0), total: sum.total + (row?.total ?? (capture.state === "captured" ? capture.detail.changes.length : 0)) };
    }, { reviewed: 0, total: 0 }) : null);
</script>

<section class="snapshot-view" aria-label="Captured review">
    <header><h3>{snapshotTitle(snapshot)}</h3><span class="captured-label">Captured snapshot · {snapshot.version === 2 ? snapshot.capturedAt : snapshot.createdAt}</span></header>
    <p class="notice">This is a captured review. Its marks and verdicts do not approve the current working copy.</p>
    <MetadataList label="Captured review details">
        <MetadataRow label="Author">{snapshot.version === 2 ? snapshot.session.author.name : snapshot.author.name}</MetadataRow>
        <MetadataRow label="Snapshot"><code>{snapshot.id}</code></MetadataRow>
        {#if marks}<MetadataRow label="Captured marks">{marks.reviewed} / {marks.total} files</MetadataRow>{/if}
        {#if snapshot.version === 1}<MetadataRow label="Format">Legacy review · read only</MetadataRow>{/if}
    </MetadataList>
    {#if snapshot.version === 2}
        <nav class="snapshot-navigation" aria-label="Captured changes">
            <button type="button" disabled={memberIndex === 0} onclick={() => { memberIndex--; selectedPath = ""; }}>Previous</button>
            <span>{memberIndex + 1} / {snapshot.members.length}</span>
            <button type="button" disabled={memberIndex >= snapshot.members.length - 1} onclick={() => { memberIndex++; selectedPath = ""; }}>Next</button>
        </nav>
        {#if captured}<h4><code>{captured.member.changeId.slice(0, 12)} · {captured.member.commitId.slice(0, 12)}</code> {captured.member.description || "(no description set)"}</h4>{/if}
        {#if captured?.state === "unavailable"}<p role="status">{captured.reason}</p>{/if}
    {/if}
    {#if files.length}
        <SelectWidget label="Captured file" options={files.map(file => ({ value: file.path.repo_path }))} value={file?.path.repo_path ?? ""} onChange={event => selectedPath = (event.currentTarget as HTMLSelectElement).value} />
        <p class="captured-label">Only captured patch context is available.</p>
        {#if file?.hunks.length}<div class="captured-diff"><DiffViewer change={file} readingKey={`snapshot:${snapshot.id}:${memberIndex}:${file.path.repo_path}`} /></div>{:else}<p role="status">No text patch was captured for this file.</p>{/if}
    {:else if captured?.state !== "unavailable"}<p>No changed files were captured.</p>{/if}
    <section class="captured-notes" aria-label="Captured notes">
        <h4>Captured notes</h4>
        {#if snapshot.version === 1}
            {#each snapshot.threads as thread (thread.id)}
                {@const anchor = thread.anchor}
                <CapturedDiscussion label={anchor.kind === "line" ? `${snapshot.snapshot.files.find(file => file.id === anchor.file)?.change.path.repo_path ?? "File"}:${anchor.start}` : anchor.kind} posts={thread.posts.map(post => ({ ...post, author: post.author.name }))} />
            {:else}<p>No notes were captured.</p>{/each}
        {:else}
            {#each notes as thread (thread.id)}
                <CapturedDiscussion label={`${thread.status} · ${thread.targets.map(target => target.subject || target.anchor.kind).join(", ")}`} posts={thread.posts.map(post => ({ id: post.id, author: post.author.name, at: post.created_at, body: post.body }))} />
            {:else}<p>No notes were captured.</p>{/each}
        {/if}
    </section>
    {#if snapshot.version === 2}
        <section class="captured-verdicts" aria-label="Captured verdicts"><h4>Captured verdicts</h4>
            {#each snapshot.session.verdicts as verdict (verdict.id)}<CapturedDiscussion label={`${verdict.person.name} · ${verdict.verdict} · ${snapshot.members.length === verdict.versions.length && snapshot.members.every(capture => capture.state === "captured" && verdict.versions.some(version => version.changeId === capture.member.changeId && version.commitId === capture.member.commitId)) ? "Matches captured versions" : "Versions differ from this snapshot"}`} posts={[{ id: verdict.id, author: verdict.person.name, at: verdict.at, body: verdict.body }]} />
            {:else}<p>No verdicts were captured.</p>{/each}
        </section>
    {/if}
</section>
<style>
    .snapshot-view { min-height: 0; overflow: auto; pointer-events: auto; padding: var(--panel-inset); display: grid; align-content: start; gap: var(--gap-group); }
    header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gap-row); }
    h3 { font: var(--font-heading); margin: 0; min-width: 0; overflow-wrap: anywhere; }
    h4 { font: var(--font-emphasis); margin: 0; overflow-wrap: anywhere; }
    code { font: var(--font-id); overflow-wrap: anywhere; }
    p { margin: 0; }
    .notice, .captured-label { color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    .snapshot-navigation { display: flex; align-items: center; gap: var(--gap-row); }
    .captured-diff { min-width: 0; overflow: auto; pointer-events: auto; }
    .captured-notes, .captured-verdicts { display: grid; gap: var(--gap-group); }
</style>
