<script lang="ts">
    import { onDestroy } from "svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import TextAreaField from "../controls/TextAreaField.svelte";
    import Icon from "../controls/Icon.svelte";
    import { getInput } from "../ipc";
    import { revisionSelectEvent } from "../stores";
    import { workspaceController } from "../workspace/state";
    import type { AnnotationThread } from "../messages/AnnotationThread";
    import Markdown from "./Markdown.svelte";
    import { anchorIcon, anchorLabel } from "./anchors";
    import { annotationError, annotationList, copyAnnotations, loadAnnotations, openAnnotation, sendAnnotations } from "./store";

    export let active: boolean;

    let showResolved = false;
    let selected = new Set<string>();
    let reply = "";
    let busy = false;
    let copied = "";
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;

    $: threads = $annotationList?.threads ?? [];
    $: visible = threads.filter(thread => showResolved || thread.status === "open");
    $: openCount = threads.filter(thread => thread.status === "open").length;
    $: current = visible.find(thread => thread.id === $openAnnotation) ?? threads.find(thread => thread.id === $openAnnotation) ?? visible[0] ?? null;
    // selection only names notes that still exist and are listed
    $: selected = new Set([...selected].filter(id => visible.some(thread => thread.id === id)));
    $: allSelected = visible.length > 0 && selected.size === visible.length;

    // an agent may reply from the command line while the view is open
    let poll: ReturnType<typeof setInterval> | undefined;
    $: {
        clearInterval(poll);
        poll = active ? setInterval(() => { if (document.visibilityState === "visible" && !busy) loadAnnotations(); }, 3000) : undefined;
        if (active) loadAnnotations();
    }
    onDestroy(() => { clearInterval(poll); clearTimeout(copiedTimer); });

    // a plain-text title: markdown syntax would be noise in a one-line list
    function firstLine(thread: AnnotationThread) {
        let line = thread.posts[0]?.body.split("\n").find(text => text.trim()) ?? "";
        return line.replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2").trim();
    }

    let relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    function age(timestamp: string, now = Date.now()) {
        let seconds = Math.max(0, (now - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return "just now";
        for (let [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
            if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
        }
        return "just now";
    }

    function toggle(id: string) {
        let next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        selected = next;
    }

    function toggleAll() {
        selected = allSelected ? new Set() : new Set(visible.map(thread => thread.id));
    }

    async function copy(ids: string[], label: string) {
        if (!ids.length) return;
        if (await copyAnnotations(ids)) {
            copied = label;
            clearTimeout(copiedTimer);
            copiedTimer = setTimeout(() => copied = "", 2400);
        }
    }

    async function run(task: () => Promise<boolean>) {
        busy = true;
        let done = await task();
        busy = false;
        return done;
    }

    async function sendReply() {
        if (!current || !reply.trim() || busy) return;
        let id = current.id;
        if (await run(() => sendAnnotations({ type: "Reply", id, body: reply }))) reply = "";
    }

    function setStatus(thread: AnnotationThread) {
        run(() => sendAnnotations({ type: "SetStatus", id: thread.id, status: thread.status === "open" ? "resolved" : "open" }));
    }

    async function remove(ids: string[]) {
        if (!ids.length) return;
        let answer = await getInput(ids.length === 1 ? "Delete this note?" : `Delete ${ids.length} notes?`, "Replies are deleted too. This can’t be undone.", [{ label: "Delete", choices: ["Cancel", "Delete"] }]);
        if (answer?.Delete !== "Delete") return;
        if (await run(() => sendAnnotations({ type: "Delete", ids }))) {
            selected = new Set();
            if ($openAnnotation && ids.includes($openAnnotation)) openAnnotation.set(null);
        }
    }

    function showTarget(thread: AnnotationThread) {
        let commit = thread.state.type === "rewritten" ? thread.state.commit_id : thread.anchor.commit_id;
        let id = {
            change: { type: "ChangeId" as const, hex: thread.anchor.change_id, prefix: thread.anchor.change_id, rest: "", offset: null, is_divergent: false },
            commit: { type: "CommitId" as const, hex: commit, prefix: commit, rest: "" },
        };
        revisionSelectEvent.set({ from: id, to: id });
        workspaceController.selectRevision({ from: id, to: id });
    }

    function stateNote(thread: AnnotationThread): string | null {
        let state = thread.state;
        if (state.type === "missing") return "This change no longer exists in the repository.";
        if (state.type !== "rewritten") return null;
        if (state.matches === true) return "The change has been rewritten since. The annotated lines are unchanged.";
        if (state.matches === false) return "The change has been rewritten since, and the annotated lines are different now.";
        return "The change has been rewritten since this note was written.";
    }

    function replyKey(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); sendReply(); }
    }
</script>

<ViewToolbar label="Annotations tools">
    <span class="summary">{openCount} open</span>
    <ToggleTray label="Show notes">
        <ToggleItem text="Open" on={!showResolved} onClick={() => showResolved = false} />
        <ToggleItem text="All" on={showResolved} onClick={() => showResolved = true} />
    </ToggleTray>
    <span class="toolbar-spacer actions">
        {#if copied}<span class="copied" role="status">{copied}</span>{/if}
        <ActionWidget safe disabled={!selected.size} onClick={() => copy([...selected], selected.size === 1 ? "Copied 1 note" : `Copied ${selected.size} notes`)}><Icon name="clipboard" />Copy{selected.size ? ` ${selected.size}` : ""}</ActionWidget>
        <ActionWidget safe disabled={!selected.size || busy} onClick={() => remove([...selected])}><Icon name="trash-2" />Delete</ActionWidget>
    </span>
</ViewToolbar>

<section class="annotations" aria-label="Annotations">
    {#if $annotationError}<p class="error" role="alert">{$annotationError}</p>{/if}
    {#if !visible.length}
        <div class="empty">
            <Icon name="message-square" />
            <h3>{threads.length ? "No open notes" : "No notes yet"}</h3>
            <p>Right-click a change, bookmark, file or diff hunk and choose Annotate. Notes stay on this computer until you copy them.</p>
            {#if threads.length}<button type="button" class="link" on:click={() => showResolved = true}>Show resolved notes</button>{/if}
        </div>
    {:else}
        <div class="layout">
            <div class="index">
                <label class="select-all"><input type="checkbox" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} on:change={toggleAll} />Select all</label>
                <ul class="rows" aria-label="Notes">
                    {#each visible as thread (thread.id)}
                        <li class="row" class:current={thread.id === current?.id} class:resolved={thread.status === "resolved"}>
                            <input type="checkbox" aria-label="Select note: {firstLine(thread)}" checked={selected.has(thread.id)} on:change={() => toggle(thread.id)} />
                            <button type="button" aria-current={thread.id === current?.id ? "true" : undefined} on:click={() => openAnnotation.set(thread.id)}>
                                <span class="row-title">{firstLine(thread)}</span>
                                <span class="row-meta">
                                    <Icon name={anchorIcon(thread.anchor)} /><span class="anchor">{anchorLabel(thread.anchor)}</span>
                                    {#if thread.posts.length > 1}<span class="replies"><Icon name="corner-down-right" />{thread.posts.length - 1}</span>{/if}
                                    {#if thread.state.type === "rewritten" || thread.state.type === "missing"}<span class="outdated" title={stateNote(thread)}>Outdated</span>{/if}
                                    {#if thread.status === "resolved"}<span>Resolved</span>{/if}
                                </span>
                            </button>
                        </li>
                    {/each}
                </ul>
                {#if $annotationList}<p class="location" title={$annotationList.location}>Stored in {$annotationList.location}</p>{/if}
            </div>

            <!-- svelte-ignore a11y_no_noninteractive_tabindex (the thread scrolls independently) -->
            <article class="detail" tabindex="0" aria-label="Note">
                {#if current}
                    <header class="detail-header">
                        <p class="target"><Icon name={anchorIcon(current.anchor)} /><span class="anchor">{anchorLabel(current.anchor)}</span></p>
                        {#if current.subject}<p class="subject">{current.subject}</p>{/if}
                        <p class="ids">change <code>{current.anchor.change_id.slice(0, 12)}</code> · commit <code>{current.anchor.commit_id.slice(0, 12)}</code> · {current.workspace || "workspace"}</p>
                        <div class="detail-actions">
                            <ActionWidget safe secondary disabled={current.state.type === "missing"} onClick={() => current && showTarget(current)}><Icon name="crosshair" />Show change</ActionWidget>
                            <ActionWidget safe secondary onClick={() => current && copy([current.id], "Copied note")}><Icon name="clipboard" />Copy</ActionWidget>
                            <ActionWidget safe secondary disabled={busy} onClick={() => current && setStatus(current)}><Icon name={current.status === "open" ? "check" : "rotate-ccw"} />{current.status === "open" ? "Resolve" : "Reopen"}</ActionWidget>
                            <ActionWidget safe secondary tip="Delete note" disabled={busy} onClick={() => current && remove([current.id])}><Icon name="trash-2" /></ActionWidget>
                        </div>
                    </header>
                    {#if stateNote(current)}<p class="state" role="note"><Icon name="alert-circle" />{stateNote(current)}</p>{/if}
                    {#if current.anchor.kind === "lines" && current.anchor.quote}<pre class="quote">{current.anchor.quote}</pre>{/if}
                    <ol class="posts" aria-label="Thread">
                        {#each current.posts as post (post.id)}
                            <li class="post">
                                <p class="byline"><span class="author">{post.author.name}</span>{#if post.author.kind === "agent"}<span class="agent">Agent</span>{/if}<time datetime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{age(post.created_at)}</time>{#if post.edited_at}<span>edited</span>{/if}</p>
                                <Markdown source={post.body} />
                            </li>
                        {/each}
                    </ol>
                    <div class="reply">
                        <TextAreaField bind:value={reply} label="Reply" rows={3} placeholder="Reply…" on:keydown={replyKey} />
                        <div class="reply-actions">
                            <span class="hint">Agents can reply with <code>gg annotations reply {current.id.slice(0, 8)}</code></span>
                            <ActionWidget safe primary disabled={!reply.trim() || busy} onClick={sendReply}>Reply</ActionWidget>
                        </div>
                    </div>
                {/if}
            </article>
        </div>
    {/if}
</section>

<style>
    .summary { color: var(--muted); font-size: var(--type-caption); }
    .actions { display: inline-flex; align-items: center; gap: 2px; }
    .copied { margin-inline-end: 8px; color: var(--muted); font-size: var(--type-caption); }
    .annotations { container: annotations / inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; background: var(--surface); color: var(--text); font-size: var(--type-ui); }
    .error { margin: 0; padding: 8px var(--panel-inset); color: var(--negative); }
    .empty { display: grid; justify-items: center; gap: 8px; max-width: 46ch; margin: 48px auto; padding: 0 var(--panel-inset); color: var(--muted); text-align: center; }
    .empty > :global(svg) { --icon-size: 20px; }
    .empty h3 { margin: 0; color: var(--text); font-size: var(--type-body); font-weight: 500; }
    .empty p { margin: 0; line-height: 1.6; }
    .link { padding: 4px 8px; border: 0; background: none; color: var(--accent); cursor: pointer; }
    .layout { display: grid; grid-template-columns: minmax(220px, 36%) minmax(0, 1fr); flex: 1; min-height: 0; }
    .index { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 6px; border-inline-end: 1px solid var(--rule); }
    .select-all { display: flex; align-items: center; gap: 8px; padding: 4px 6px 6px; color: var(--muted); font-size: var(--type-caption); }
    .rows { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
    .row { display: flex; align-items: flex-start; gap: 2px; border-radius: var(--radius-control); }
    .row > input { flex: none; margin: 12px 4px 0 6px; }
    .row > button { display: grid; flex: 1; gap: 4px; min-width: 0; padding: 8px 8px 8px 4px; border: 0; border-radius: var(--radius-control); background: transparent; color: inherit; text-align: start; cursor: pointer; }
    .row.current { background: var(--interaction-selected); }
    .row.current .row-title { font-weight: 500; }
    .row.resolved .row-title { color: var(--muted); }
    .row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-meta { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--muted); font-size: var(--type-caption); --icon-size: 12px; }
    .anchor { min-width: 0; overflow: hidden; font-family: var(--stack-code); text-overflow: ellipsis; white-space: nowrap; }
    .replies { display: inline-flex; align-items: center; gap: 2px; flex: none; }
    .outdated { flex: none; color: var(--warning); }
    .location { margin: auto 0 0; padding: 12px 6px 4px; overflow: hidden; color: var(--muted); font-size: var(--type-caption); text-overflow: ellipsis; white-space: nowrap; }
    .detail { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 14px var(--panel-inset) 24px; }
    .detail:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .detail-header { display: grid; gap: 2px; padding-block-end: 10px; border-block-end: 1px solid var(--rule); }
    .detail-header > p { margin: 0; min-width: 0; }
    .target { display: flex; align-items: center; gap: 8px; font-size: var(--type-body); font-weight: 500; overflow-wrap: anywhere; --icon-size: 14px; }
    .target > :global(svg) { flex: none; }
    .target .anchor { font-size: var(--type-code); }
    .subject { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
    .ids { overflow: hidden; color: var(--muted); font-size: var(--type-caption); text-overflow: ellipsis; white-space: nowrap; }
    .ids code { font: var(--type-caption)/1 var(--stack-code); color: var(--text); }
    .detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 8px 0 0 -8px; }
    .state { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; color: var(--warning); --icon-size: 14px; }
    .quote { max-height: 200px; margin: 12px 0 0; padding: 8px 10px; overflow: auto; border-radius: var(--radius-control); background: var(--diff-buffer); font: var(--type-code)/var(--code-leading) var(--stack-code); white-space: pre; }
    .posts { display: grid; gap: 18px; margin: 16px 0 0; padding: 0; list-style: none; }
    .byline { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; color: var(--muted); font-size: var(--type-caption); }
    .author { color: var(--text); font-size: var(--type-ui); font-weight: 500; }
    .agent { padding: 0 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
    .reply { display: grid; gap: 8px; margin-top: 20px; padding-top: 14px; border-block-start: 1px solid var(--rule); }
    .reply-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .hint { min-width: 0; color: var(--muted); font-size: var(--type-caption); }
    .hint code { font: var(--type-caption)/1 var(--stack-code); }
    @container annotations (max-width: 620px) {
        .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(120px, 40%) minmax(0, 1fr); }
        .index { border-inline-end: 0; border-block-end: 1px solid var(--rule); }
        .hint { display: none; }
    }
    @media (hover: hover) { .row:not(.current):hover { background: var(--interaction-hover); } }
    .row > button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    @media (pointer: coarse), (max-width: 600px) {
        .row > button { min-height: 44px; }
        .row > input, .select-all > input { width: 22px; height: 22px; margin: 11px 6px; }
    }
</style>
