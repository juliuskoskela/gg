<script lang="ts">
    import Markdown from "../../annotations/Markdown.svelte";
    import TargetList from "../../annotations/TargetList.svelte";
    import type { AnnotationList } from "../../messages/AnnotationList";
    import type { ReviewAPI } from "./api";
    import type { ReviewMember } from "./model";
    interface Props { api: ReviewAPI; session: string; member: ReviewMember | null; notes: AnnotationList | null; onUpdate: () => Promise<void>; }
    let { api, session, member, notes, onUpdate }: Props = $props();
    let body = $state("");
    let reply = $state("");
    let replying = $state<string | null>(null);
    let editing = $state<{ thread: string; post: string; body: string } | null>(null);
    let error = $state("");
    let busy = $state(false);
    async function run(action: () => Promise<unknown>) {
        if (busy) return;
        busy = true; error = "";
        try { await action(); await onUpdate(); } catch (problem) { error = String(problem); }
        finally { busy = false; }
    }
</script>
<section class="notes" aria-label="Review notes">
    <h3>Notes</h3>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if !notes}<p class="muted">Loading notes…</p>{:else if !notes.threads.length}<p class="muted">No notes in this review.</p>{/if}
    {#each notes?.threads ?? [] as thread (thread.id)}
        <article class="thread" aria-label="Review note">
            <div class="note-heading"><span>{thread.status === "resolved" ? "Resolved" : "Open"}</span><button type="button" disabled={busy} onclick={() => run(() => api.notes.setStatus(session, thread.id, thread.status === "open" ? "resolved" : "open"))}>{thread.status === "open" ? "Resolve" : "Reopen"}</button></div>
            <TargetList targets={thread.targets} />
            {#each thread.posts as post (post.id)}
                <div>
                    <p class="muted">{post.author.name}</p>
                    {#if editing?.post === post.id}
                        <form onsubmit={event => { event.preventDefault(); run(async () => { await api.notes.edit(session, thread.id, post.id, editing!.body); editing = null; }); }}>
                            <label>Edit note<textarea bind:value={editing.body} rows="3"></textarea></label>
                            <button type="submit" disabled={busy || !editing.body.trim()}>Save</button>
                            <button type="button" disabled={busy} onclick={() => editing = null}>Cancel</button>
                        </form>
                    {:else}
                        <Markdown source={post.body} />
                        {#if notes && post.author.name === notes.me.name && post.author.kind === notes.me.kind}<button type="button" disabled={busy} onclick={() => editing = { thread: thread.id, post: post.id, body: post.body }}>Edit note</button>{/if}
                    {/if}
                </div>
            {/each}
            <button type="button" disabled={busy} onclick={() => { replying = thread.id; reply = ""; }}>Reply</button>
            {#if replying === thread.id}
                <form onsubmit={event => { event.preventDefault(); run(async () => { await api.notes.reply(session, thread.id, reply); reply = ""; replying = null; }); }}>
                    <label>Reply<textarea bind:value={reply} rows="3"></textarea></label>
                    <button type="submit" disabled={busy || !reply.trim()}>Send reply</button>
                    <button type="button" disabled={busy} onclick={() => replying = null}>Cancel</button>
                </form>
            {/if}
        </article>
    {/each}
    {#if member}
        <form onsubmit={event => { event.preventDefault(); run(async () => { await api.notes.create(session, [{ anchor: { kind: "revision", change_id: member!.changeId, commit_id: member!.commitId }, subject: member!.description.split("\n")[0] }], body); body = ""; }); }}>
            <label>Note on this change<textarea bind:value={body} rows="3"></textarea></label>
            <button type="submit" disabled={busy || !body.trim()}>Add note</button>
        </form>
    {/if}
</section>
<style>
    .notes, .thread, form { display: grid; gap: var(--gap-group); min-width: 0; }
    .thread { border: 1px solid var(--border); padding: var(--space-3); border-radius: var(--radius-control); }
    .note-heading { display: flex; justify-content: space-between; gap: var(--gap-row); align-items: center; }
    .muted { color: var(--muted); }
    label { display: grid; gap: var(--gap-row); font: var(--font-label); }
    textarea { width: 100%; box-sizing: border-box; }
    h3 { font: var(--font-heading); margin: 0; }
</style>
