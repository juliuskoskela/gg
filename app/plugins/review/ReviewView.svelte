<script lang="ts">
    import { untrack } from "svelte";
    import ViewToolbar from "../../controls/ViewToolbar.svelte";
    import LogList from "../../controls/LogList.svelte";
    import MetadataList from "../../controls/MetadataList.svelte";
    import MetadataRow from "../../controls/MetadataRow.svelte";
    import Markdown from "../../annotations/Markdown.svelte";
    import type { PluginViewProps } from "../types";
    import { controllers } from "./controller";
    import type { ReviewAPI } from "./api";
    import SessionNotes from "./SessionNotes.svelte";
    import { personKey, progressFor, queue, revision, member, verdictFor, type Verdict } from "./model";
    let { api }: PluginViewProps = $props();
    let reviewApi = untrack(() => api as ReviewAPI);
    let controller = untrack(() => controllers.get(api))!;
    let viewState = controller.state;
    let title = $state("");
    let emails = $state("");
    let body = $state("");
    let error = $state("");
    let creating = $state(false);
    let showAll = $state(false);
    let memberIndex = $state(0);
    let editingParticipants = $state(false);
    let participantEmails = $state("");
    let session = $derived($viewState.sessions.find(session => session.id === $viewState.selected));
    let versions = $derived(new Map([...$viewState.current].map(([id, header]) => [id, header?.id.commit.hex ?? null])));
    let pending = $derived($viewState.progress ? queue($viewState.sessions, $viewState.progress.me, versions, $viewState.progress) : []);
    let listed = $derived(showAll ? $viewState.sessions : pending);
    let rows = $derived(listed.map(session => {
        let progress = progressFor(session, $viewState.progress);
        return { id: session.id, title: session.title, who: session.author.name, time: session.createdAt, badge: `${progress.reviewed}/${progress.total} files` };
    }));
    let selectedMember = $derived(session?.members[Math.min(memberIndex, session.members.length - 1)]);
    let current = $derived(selectedMember ? $viewState.current.get(selectedMember.changeId) : null);
    let canVerdict = $derived(session && $viewState.progress && session.participants.some(person => personKey(person) === personKey($viewState.progress!.me)) && session.members.every(member => $viewState.current.get(member.changeId)) && !$viewState.busy);
    async function run(action: () => Promise<unknown>) {
        error = "";
        try { await action(); } catch (problem) { error = problem instanceof Error ? problem.message : String(problem); }
    }
    function select(id: string | null) {
        memberIndex = 0; body = ""; editingParticipants = false; controller.select(id);
        let first = $viewState.sessions.find(session => session.id === id)?.members[0];
        if (first) void run(() => reviewApi.navigation.select($viewState.current.get(first.changeId)?.id ?? revision(first)));
    }
    async function step(index: number) {
        if (!session) return;
        memberIndex = index;
        let selected = session.members[index];
        await run(() => reviewApi.navigation.select($viewState.current.get(selected.changeId)?.id ?? revision(selected)));
    }
    async function record(verdict: Verdict) {
        if (!session) return;
        await run(async () => { await controller.verdict(session!, verdict, body); body = ""; });
    }
</script>

<ViewToolbar label="Review tools">
    {#if session}<button type="button" onclick={() => select(null)}>Reviews</button>{/if}
    <span class="toolbar-lead">{session?.title ?? "Reviews"}</span>
    <button type="button" disabled={$viewState.busy} onclick={() => run(controller.refresh)}>Refresh</button>
    <button type="button" disabled={!$viewState.selection || $viewState.busy} onclick={() => creating = !creating}>New review</button>
</ViewToolbar>
<section class="review-view" aria-label="Reviews">
    {#if error || $viewState.error}<p role="alert" class="error">{error || $viewState.error}</p>{/if}
    {#if creating}
        <form class="review-form" onsubmit={event => { event.preventDefault(); run(async () => { await controller.create(title, emails); title = ""; emails = ""; creating = false; memberIndex = 0; }); }}>
            <label>Title<input required bind:value={title} /></label>
            <label>Other reviewers’ email addresses<input bind:value={emails} placeholder="Separated by commas" /></label>
            <p class="muted">You are included as a reviewer. The selected changes are captured in timeline order.</p>
            <div class="actions"><button type="submit" disabled={$viewState.busy}>Create review</button><button type="button" onclick={() => creating = false}>Cancel</button></div>
        </form>
    {/if}
    {#if session}
        <MetadataList label="Review session">
            <MetadataRow label="Created by">{session.author.name}</MetadataRow>
            <MetadataRow label="Reviewers">{session.participants.map(person => person.name).join(", ")} <button type="button" onclick={() => { participantEmails = session!.participants.map(person => person.email || person.name).join(", "); editingParticipants = !editingParticipants; }}>Edit reviewers</button></MetadataRow>
        </MetadataList>
        {#if editingParticipants}
            <form class="review-form" onsubmit={event => { event.preventDefault(); run(async () => { await controller.participants(session!, participantEmails); editingParticipants = false; }); }}>
                <label>Reviewer email addresses<input required bind:value={participantEmails} /></label>
                <div class="actions"><button type="submit" disabled={$viewState.busy}>Save reviewers</button><button type="button" onclick={() => editingParticipants = false}>Cancel</button></div>
            </form>
        {/if}
        <nav class="member-nav" aria-label="Review changes">
            <button type="button" disabled={memberIndex === 0} onclick={() => step(memberIndex - 1)}>Previous</button>
            <span>{memberIndex + 1} / {session.members.length}</span>
            <button type="button" disabled={memberIndex >= session.members.length - 1} onclick={() => step(memberIndex + 1)}>Next</button>
        </nav>
        {#if selectedMember}
            {@const progress = $viewState.progress?.changes.find(change => change.change_id === selectedMember.changeId)}
            <div class="member">
                <code>{selectedMember.changeId.slice(0, 12)}</code>
                <span class="muted"> · {progress?.reviewed ?? 0}/{progress?.total ?? 0} files reviewed · {$viewState.notes?.threads.filter(thread => thread.status === "open" && thread.targets.some(target => target.anchor.change_id === selectedMember.changeId)).length ?? 0} open notes</span>
                <button type="button" onclick={() => run(() => reviewApi.navigation.select(current?.id ?? revision(selectedMember!)))}>Open changes</button>
                <Markdown source={current?.description.lines.join("\n") ?? selectedMember.description} />
                {#if !current}<p class="muted">This change is missing or cannot be resolved. Its captured description is shown.</p>{/if}
                {#if current && current.id.commit.hex !== selectedMember.commitId}<p class="muted">Rewritten since this review was created.</p>{/if}
            </div>
        {/if}
        {#key session.id}<SessionNotes api={reviewApi} session={session.id} member={current ? member(current) : null} notes={$viewState.notes} onUpdate={controller.notes} />{/key}
        <section aria-label="Participant verdicts">
            <h3>Verdicts</h3>
            <MetadataList label="Participant verdicts">
                {#each session.participants as person (personKey(person))}
                    {@const decision = verdictFor(session, person, versions)}
                    <MetadataRow label={person.name}>
                        {#if decision}{decision.event.verdict === "request-changes" ? "Changes requested" : decision.event.verdict === "approve" ? "Approved" : "Commented"}{decision.stale ? " · outdated" : ""}
                        {#if decision.event.body}<Markdown source={decision.event.body} />{/if}
                        {:else}Waiting{/if}
                    </MetadataRow>
                {/each}
            </MetadataList>
        </section>
        <form class="review-form" onsubmit={event => { event.preventDefault(); record("comment"); }}>
            <label>Review summary<textarea bind:value={body} rows="3"></textarea></label>
            <div class="actions">
                <button type="button" disabled={!canVerdict} onclick={() => record("approve")}>Approve</button>
                <button type="button" disabled={!canVerdict} onclick={() => record("request-changes")}>Request changes</button>
                <button type="submit" disabled={!canVerdict || !body.trim()}>Comment</button>
            </div>
        </form>
    {:else}
        <div class="queue-filter"><button type="button" aria-pressed={!showAll} onclick={() => showAll = false}>Waiting on you · {pending.length}</button><button type="button" aria-pressed={showAll} onclick={() => showAll = true}>All · {$viewState.sessions.length}</button></div>
        {#if rows.length}<LogList {rows} label="Reviews" onSelect={select} columns={{ code: false, who: true, time: true }} />
        {:else}<p class="muted">{showAll ? "No reviews yet. Select changes in the timeline, then create a review." : "No reviews waiting on you."}</p>{/if}
    {/if}
</section>
<style>
    .review-view { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--space-4); min-width: 0; }
    .review-form { display: grid; gap: var(--gap-group); }
    label { display: grid; gap: var(--gap-row); font: var(--font-label); }
    input, textarea { width: 100%; box-sizing: border-box; }
    .actions, .member-nav, .queue-filter { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-row); }
    .member-nav { justify-content: space-between; }
    .member { border-block: 1px solid var(--border); padding-block: var(--space-3); }
    .muted { color: var(--muted); }
    .error { color: var(--negative); }
    h3 { font: var(--font-heading); margin: 0 0 var(--gap-group); }
</style>
