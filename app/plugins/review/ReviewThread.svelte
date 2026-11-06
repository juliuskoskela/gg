<script lang="ts">
    import ActionWidget from "../../controls/ActionWidget.svelte";
    import TextAreaField from "../../controls/TextAreaField.svelte";
    import SelectWidget from "../../controls/SelectWidget.svelte";
    import { anchorLabel, latest, threadStatus, type Review, type Thread, type Status } from "./model";
    import { reply, setStatus } from "./store";
    export let review: Review;
    export let thread: Thread;
    export let onLocate: () => void;
    export let onError: (message: string) => void;
    let writing = false;
    let body = "";
    $: status = threadStatus(thread);
    $: posts = [...thread.posts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
    $: event = latest(thread.events);
    function act(action: () => void) { try { action(); } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); } }
    function send() { act(() => { reply(review.id, thread.id, body); body = ""; writing = false; }); }
</script>

<article id="review-thread-{thread.id}" tabindex="-1" class:closed={status !== "open"} aria-label={`Discussion: ${anchorLabel(thread.anchor, review)}`}>
    <header>
        <button class="anchor" type="button" title="Show captured context" on:click={onLocate}>{anchorLabel(thread.anchor, review)}</button>
        <SelectWidget label={`Discussion status: ${posts[0].body.slice(0, 50)}`} value={status} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "obsolete", label: "Obsolete" }]} on:change={e => act(() => setStatus(review.id, thread.id, (e.detail.target as HTMLSelectElement).value as Status))} let:option>{option.label}</SelectWidget>
    </header>
    {#if thread.anchor.kind === "line"}<pre aria-label="Captured source"><code>{thread.anchor.quote}</code></pre>{/if}
    {#each posts as post (post.id)}
        <div class="post"><div class="byline"><strong>{post.author.name}</strong><time datetime={post.at} title={post.at}>{new Date(post.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><p>{post.body}</p></div>
    {/each}
    {#if event}<p class="event">{event.author.name} marked this {event.status}.</p>{/if}
    {#if writing}
        <form on:submit|preventDefault={send}>
            <TextAreaField label="Reply to discussion" bind:value={body} rows="3" maxlength="20000" required placeholder="Add to the discussion…" />
            <div class="actions"><ActionWidget safe onClick={() => writing = false}>Cancel</ActionWidget><button class="send" type="submit" disabled={!body.trim()}>Reply</button></div>
        </form>
    {:else}<ActionWidget safe onClick={() => writing = true}>Reply{posts.length > 1 ? ` · ${posts.length - 1}` : ""}</ActionWidget>{/if}
</article>

<style>
    @import "../../controls/action.css";
    article { padding-block: 18px; scroll-margin-block: 16px; }
    header { display: flex; align-items: start; justify-content: space-between; gap: 8px; margin-block-end: 10px; }
    .anchor { min-width: 0; padding-inline: 0; text-align: start; justify-content: start; white-space: normal; color: var(--muted); font-size: var(--type-caption); overflow-wrap: anywhere; }
    header :global(.wrapper) { flex: 0 0 auto; max-width: 110px; font-size: var(--type-caption); }
    header :global(select) { background-color: transparent; border-color: transparent; }
    pre { padding: 8px 10px; margin: 0 0 14px; max-height: 180px; overflow: auto; border-inline-start: 2px solid var(--faint); background: var(--raised); font: var(--type-code) var(--stack-code); line-height: 1.6; }
    .post + .post { margin-block-start: 18px; padding-inline-start: 12px; border-inline-start: 1px solid var(--rule); }
    .byline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; font-size: var(--type-caption); }
    strong { color: var(--text); font-weight: 500; }
    time, .event { color: var(--muted); font-size: var(--type-caption); }
    p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; user-select: text; }
    .event { margin-block: 12px 4px; }
    form { margin-block-start: 12px; }
    .actions { display: flex; justify-content: end; gap: 4px; margin-block-start: 6px; }
    .send { background: var(--interaction-selected); }
    .closed .anchor { color: var(--muted); }
</style>
