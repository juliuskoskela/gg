<script lang="ts">
    import { onDestroy } from "svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import Icon from "../controls/Icon.svelte";
    import { getInput } from "../ipc";
    import type { AnchorState } from "../messages/AnchorState";
    import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
    import type { AnnotationPost } from "../messages/AnnotationPost";
    import type { AnnotationThread } from "../messages/AnnotationThread";
    import Markdown from "./Markdown.svelte";
    import NoteCheck from "./NoteCheck.svelte";
    import NoteEditor from "./NoteEditor.svelte";
    import TargetList from "./TargetList.svelte";
    import { anchorDescription, anchorIcon, anchorLabel } from "./anchors";
    import { annotationError, annotationList, copyAnnotations, discardDraft, draft, draftFocus, DRAFT, justAdded, loadAnnotations, noteTitle, openAnnotation, plainLine, removeTarget, saveDraft, sendAnnotations } from "./store";

    export let active: boolean;

    type Target = { anchor: AnnotationAnchor; subject: string; state?: AnchorState };

    let showResolved = false;
    let selected = new Set<string>();
    let reply = "";
    let editing: { post: string; body: string } | null = null;
    let editingFor: string | undefined;
    let busy = false;
    let copied = "";
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;
    let addedTimer: ReturnType<typeof setTimeout> | undefined;
    let now = Date.now();

    $: threads = $annotationList?.threads ?? [];
    $: me = $annotationList?.me;
    $: visible = threads.filter(thread => showResolved || thread.status === "open");
    $: openCount = threads.filter(thread => thread.status === "open").length;
    $: showingDraft = $openAnnotation === DRAFT && !!$draft;
    $: current = showingDraft ? null : threads.find(thread => thread.id === $openAnnotation) ?? null;
    $: detailOpen = showingDraft || !!current;
    // selection only names notes that still exist and are listed
    $: selected = new Set([...selected].filter(id => visible.some(thread => thread.id === id)));
    $: allSelected = visible.length > 0 && selected.size === visible.length;
    // an edit or reply belongs to the note it was started on
    $: if (current?.id !== editingFor) { editing = null; reply = ""; editingFor = current?.id; }
    $: highlight = $justAdded && $justAdded.note === (showingDraft ? DRAFT : current?.id) ? $justAdded.anchors : [];
    $: if ($justAdded) { clearTimeout(addedTimer); addedTimer = setTimeout(() => justAdded.set(null), 1600); }

    // an agent may reply from the command line while the view is open
    let poll: ReturnType<typeof setInterval> | undefined;
    $: {
        clearInterval(poll);
        poll = active ? setInterval(() => { now = Date.now(); if (document.visibilityState === "visible" && !busy) loadAnnotations(); }, 3000) : undefined;
        if (active) loadAnnotations();
    }
    onDestroy(() => { clearInterval(poll); clearTimeout(copiedTimer); clearTimeout(addedTimer); });

    let relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
    function age(timestamp: string, reference: number) {
        let seconds = Math.max(0, (reference - new Date(timestamp).getTime()) / 1000);
        for (let [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
            if (seconds >= size) return relative.format(-Math.floor(seconds / size), unit);
        }
        return "just now";
    }

    function mine(post: AnnotationPost) {
        return !!me && post.author.name === me.name && post.author.kind === me.kind;
    }

    function outdatedCount(thread: AnnotationThread) {
        return thread.targets.filter(target => target.state.type === "rewritten" || target.state.type === "missing").length;
    }

    function quotes(targets: Target[]) {
        return targets.flatMap(target => target.anchor.kind === "lines" && target.anchor.quote ? [{ anchor: target.anchor, quote: target.anchor.quote }] : []);
    }

    function toggleOpen(id: string) {
        openAnnotation.set($openAnnotation === id ? null : id);
    }

    function close() {
        openAnnotation.set(null);
    }

    function toggle(id: string) {
        let next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        selected = next;
    }

    function toggleAll() {
        selected = allSelected ? new Set() : new Set(visible.map(thread => thread.id));
    }

    async function copy(ids: string[]) {
        if (!ids.length) return;
        if (await copyAnnotations(ids)) {
            copied = ids.length === 1 ? "Copied 1 note" : `Copied ${ids.length} notes`;
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

    async function saveEdit() {
        if (!current || !editing?.body.trim() || busy) return;
        let { post, body } = editing, id = current.id;
        if (await run(() => sendAnnotations({ type: "Edit", id, post, body }))) editing = null;
    }

    async function save() {
        if (busy) return;
        await run(saveDraft);
    }

    async function discard() {
        if ($draft?.body.trim()) {
            let answer = await getInput("Discard this note?", "The text you wrote will be lost.", [{ label: "Note", choices: ["Keep editing", "Discard"] }]);
            if (answer?.Note !== "Discard") return;
        }
        discardDraft();
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
            if ($openAnnotation && ids.includes($openAnnotation)) close();
        }
    }

    function keydown(event: KeyboardEvent) {
        if (event.key === "Escape" && detailOpen && !event.defaultPrevented) { event.preventDefault(); close(); }
    }
</script>

{#snippet context(targets: Target[], note: string)}
    <TargetList {targets} {highlight} removable={targets.length > 1} onRemove={anchor => removeTarget(note, anchor)} />
    {#if targets.length === 1 && targets[0].subject}<p class="subject">{targets[0].subject}</p>{/if}
    {#each quotes(targets) as { anchor, quote } (JSON.stringify(anchor))}
        <figure class="quote">
            {#if targets.length > 1}<figcaption><Icon name="code" />{anchorLabel(anchor)}</figcaption>{/if}
            <pre aria-label="Annotated code, {anchorDescription(anchor)}">{quote}</pre>
        </figure>
    {/each}
{/snippet}

<ViewToolbar label="Annotations tools">
    {#if visible.length}<NoteCheck checked={allSelected} indeterminate={selected.size > 0 && !allSelected} label="Select all notes" onChange={toggleAll} />{/if}
    <span class="summary">{selected.size ? `${selected.size} selected` : `${openCount} open`}</span>
    <ToggleTray label="Show notes">
        <ToggleItem text="Open" on={!showResolved} onClick={() => showResolved = false} />
        <ToggleItem text="All" on={showResolved} onClick={() => showResolved = true} />
    </ToggleTray>
    <span class="toolbar-spacer actions">
        {#if copied}<span class="copied" role="status">{copied}</span>{/if}
        <!-- actions on a selection appear with it, so the resting toolbar shows only what applies -->
        {#if selected.size}
            <ActionWidget safe onClick={() => copy([...selected])}><Icon name="clipboard" />Copy selected</ActionWidget>
            <ActionWidget safe disabled={busy} onClick={() => remove([...selected])}><Icon name="trash-2" />Delete selected</ActionWidget>
        {/if}
    </span>
</ViewToolbar>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape closes the open note from anywhere in the view) -->
<section class="annotations" aria-label="Annotations" on:keydown={keydown}>
    {#if $annotationError}<p class="error" role="alert">{$annotationError}</p>{/if}
    {#if !visible.length && !$draft}
        <div class="empty">
            <Icon name="message-square" />
            <h3>{threads.length ? "No open notes" : "No notes yet"}</h3>
            <p>Right-click changes, bookmarks, files or diff lines and choose Annotate. Select several changes first to note them together. Notes stay on this computer until you copy them.</p>
            {#if threads.length}<button type="button" class="link" on:click={() => showResolved = true}>Show resolved notes</button>{/if}
        </div>
    {:else}
        <div class="layout" class:open={detailOpen}>
            <div class="index">
                <ul class="rows" class:selecting={selected.size > 0} aria-label="Notes">
                    {#if $draft}
                        <li class="row draft" class:current={showingDraft}>
                            <span class="check-slot"></span>
                            <button type="button" aria-expanded={showingDraft} aria-controls="annotation-detail" on:click={() => showingDraft ? close() : openAnnotation.set(DRAFT)}>
                                <span class="row-title">{plainLine($draft.body) || "Unsaved note"}</span>
                                <span class="row-meta">
                                    <span class="draft-tag"><Icon name="edit-3" />Draft</span>
                                    <Icon name={anchorIcon($draft.targets[0].anchor)} /><span class="anchor">{anchorLabel($draft.targets[0].anchor)}</span>
                                    {#if $draft.targets.length > 1}<span class="pill" title="Points at {$draft.targets.length} places">+{$draft.targets.length - 1}</span>{/if}
                                </span>
                            </button>
                        </li>
                    {/if}
                    {#each visible as thread (thread.id)}
                        {@const outdated = outdatedCount(thread)}
                        <li class="row" class:current={thread.id === current?.id} class:checked={selected.has(thread.id)} class:resolved={thread.status === "resolved"}>
                            <span class="check-slot"><NoteCheck checked={selected.has(thread.id)} label="Select note: {noteTitle(thread)}" onChange={() => toggle(thread.id)} /></span>
                            <button type="button" aria-expanded={thread.id === current?.id} aria-controls="annotation-detail" on:click={() => toggleOpen(thread.id)}>
                                <span class="row-title">{noteTitle(thread)}</span>
                                <span class="row-meta">
                                    <Icon name={anchorIcon(thread.targets[0].anchor)} /><span class="anchor" title={anchorDescription(thread.targets[0].anchor, thread.targets[0].subject)}>{anchorLabel(thread.targets[0].anchor)}</span>
                                    {#if thread.targets.length > 1}<span class="pill" title="Points at {thread.targets.length} places">+{thread.targets.length - 1}</span>{/if}
                                    {#if thread.posts.length > 1}<span class="pill" title="{thread.posts.length - 1} {thread.posts.length === 2 ? 'reply' : 'replies'}"><Icon name="message-square" />{thread.posts.length - 1}</span>{/if}
                                    {#if outdated}<span class="flag warning" title={outdated === 1 ? "Points at something that changed since" : `${outdated} places changed since`}><Icon name="alert-triangle" /><span class="sr-only">Outdated</span></span>{/if}
                                    {#if thread.status === "resolved"}<span class="flag" title="Resolved"><Icon name="check-circle" /><span class="sr-only">Resolved</span></span>{/if}
                                    <time class="row-age" datetime={thread.updated_at}>{age(thread.updated_at, now)}</time>
                                </span>
                            </button>
                        </li>
                    {/each}
                </ul>
                {#if $annotationList}<p class="location" title={$annotationList.location}>Stored on this computer in {$annotationList.location}</p>{/if}
            </div>

            {#if detailOpen}
                <article class="detail" id="annotation-detail" aria-label={showingDraft ? "New note" : "Note"}>
                    {#if showingDraft && $draft}
                        <header class="detail-header">
                            <div class="context">{@render context($draft.targets, DRAFT)}</div>
                            <button type="button" class="close" aria-label="Close draft" title="Close (the draft is kept)" on:click={close}><Icon name="x" /></button>
                        </header>
                        <p class="tip"><Icon name="plus-square" />To point this note at more places, right-click them and choose Add to draft.</p>
                        <div class="compose">
                            <NoteEditor bind:value={$draft.body} label="Note" rows={8} placeholder="What did you notice?" focusKey={$draftFocus} onSubmit={save} />
                            <div class="compose-actions">
                                <span class="hint">Saved on this computer only.</span>
                                <ActionWidget safe secondary disabled={busy} onClick={discard}>Discard</ActionWidget>
                                <ActionWidget safe primary disabled={!$draft.body.trim() || busy} onClick={save}>Save note</ActionWidget>
                            </div>
                        </div>
                    {:else if current}
                        <header class="detail-header">
                            <div class="context">{@render context(current.targets, current.id)}</div>
                            <button type="button" class="close" aria-label="Close note" title="Close" on:click={close}><Icon name="x" /></button>
                        </header>
                        <div class="detail-actions">
                            <ActionWidget safe secondary onClick={() => current && copy([current.id])}><Icon name="clipboard" />Copy</ActionWidget>
                            <ActionWidget safe secondary disabled={busy} onClick={() => current && setStatus(current)}><Icon name={current.status === "open" ? "check" : "rotate-ccw"} />{current.status === "open" ? "Resolve" : "Reopen"}</ActionWidget>
                            <ActionWidget safe secondary tip="Delete note" disabled={busy} onClick={() => current && remove([current.id])}><Icon name="trash-2" /></ActionWidget>
                        </div>
                        <ol class="posts" aria-label="Thread">
                            {#each current.posts as post (post.id)}
                                <li class="post" class:editing={editing?.post === post.id}>
                                    <p class="byline">
                                        <span class="author">{post.author.name}</span>{#if post.author.kind === "agent"}<span class="agent">Agent</span>{/if}
                                        <time datetime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{age(post.created_at, now)}</time>{#if post.edited_at}<span title={new Date(post.edited_at).toLocaleString()}>edited</span>{/if}
                                        {#if mine(post) && editing?.post !== post.id}<button type="button" class="post-edit" on:click={() => editing = { post: post.id, body: post.body }}>Edit</button>{/if}
                                    </p>
                                    {#if editing?.post === post.id}
                                        <NoteEditor bind:value={editing.body} label="Edit note" rows={5} focusKey={post.id} onSubmit={saveEdit} onCancel={() => editing = null} />
                                        <div class="compose-actions">
                                            <ActionWidget safe secondary onClick={() => editing = null}>Cancel</ActionWidget>
                                            <ActionWidget safe primary disabled={!editing.body.trim() || editing.body === post.body || busy} onClick={saveEdit}>Save</ActionWidget>
                                        </div>
                                    {:else}
                                        <Markdown source={post.body} />
                                    {/if}
                                </li>
                            {/each}
                        </ol>
                        <div class="reply">
                            <NoteEditor bind:value={reply} label="Reply" rows={3} placeholder="Reply…" onSubmit={sendReply} />
                            <div class="compose-actions">
                                <span class="hint">Agents can reply with <code>gg annotations reply {current.id.slice(0, 8)}</code></span>
                                <ActionWidget safe primary disabled={!reply.trim() || busy} onClick={sendReply}>Reply</ActionWidget>
                            </div>
                        </div>
                    {/if}
                </article>
            {/if}
        </div>
    {/if}
</section>

<style>
    .summary { color: var(--muted); font-size: var(--type-caption); font-variant-numeric: tabular-nums; }
    .actions { display: inline-flex; align-items: center; gap: 2px; }
    .copied { margin-inline-end: 8px; color: var(--muted); font-size: var(--type-caption); }
    .annotations { container: annotations / inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; background: var(--surface); color: var(--text); font-size: var(--type-ui); }
    .error { margin: 0; padding: 8px var(--panel-inset); color: var(--negative); }
    .empty { display: grid; justify-items: center; gap: 8px; max-width: 46ch; margin: 48px auto; padding: 0 var(--panel-inset); color: var(--muted); text-align: center; }
    .empty > :global(svg) { --icon-size: 20px; }
    .empty h3 { margin: 0; color: var(--text); font-size: var(--type-body); font-weight: 500; }
    .empty p { margin: 0; line-height: 1.6; }
    .link { padding: 4px 8px; border: 0; background: none; color: var(--text); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    .layout { display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; min-height: 0; }
    .layout.open { grid-template-columns: minmax(240px, 34%) minmax(0, 1fr); }
    .index { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 4px 0; }
    .layout.open .index { border-inline-end: 1px solid var(--rule); }

    .rows { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
    .row { position: relative; display: flex; align-items: flex-start; border-radius: var(--radius-control); }
    .check-slot { display: grid; place-items: center; flex: none; width: 28px; height: 38px; }
    /* checks appear where they can be used: on hover or focus, and everywhere once a selection exists */
    @media (hover: hover) and (pointer: fine) {
        .check-slot { opacity: 0; }
        .row:hover .check-slot, .row:focus-within .check-slot, .rows.selecting .check-slot { opacity: 1; }
    }
    .row > button { display: grid; flex: 1; gap: 3px; min-width: 0; padding: 7px 10px 7px 0; border: 0; border-radius: var(--radius-control); background: transparent; color: inherit; text-align: start; cursor: pointer; }
    .row.current { background: var(--interaction-selected); }
    .row.checked:not(.current) { background: var(--interaction-hover); }
    .row.current .row-title { font-weight: 500; }
    .row.resolved .row-title { color: var(--muted); }
    .row.draft .row-title { font-style: italic; }
    .row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px; }
    .row-meta { display: flex; align-items: center; gap: 5px; min-width: 0; height: 18px; color: var(--muted); font-size: var(--type-caption); --icon-size: 12px; }
    .row-meta > :global(svg) { flex: none; }
    .anchor { min-width: 0; overflow: hidden; font-family: var(--stack-code); text-overflow: ellipsis; white-space: nowrap; }
    /* counts read like notification badges: a number on a soft ink pill */
    .pill { display: inline-flex; flex: none; align-items: center; gap: 3px; height: 16px; min-width: 16px; padding: 0 5px; border-radius: 8px; background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); font: 500 11px/1 var(--stack-ui); font-variant-numeric: tabular-nums; --icon-size: 10px; }
    .draft-tag { display: inline-flex; flex: none; align-items: center; gap: 3px; margin-inline-end: 2px; color: var(--text); font-weight: 500; }
    .flag { display: inline-flex; flex: none; color: var(--muted); }
    .flag.warning { color: var(--warning); }
    .row-age { flex: none; margin-inline-start: auto; font-variant-numeric: tabular-nums; }
    .location { margin: auto 0 0; padding: 14px 10px 10px; overflow: hidden; color: var(--muted); font-size: var(--type-caption); text-overflow: ellipsis; white-space: nowrap; }

    .detail { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 12px var(--panel-inset) 24px; }
    .detail-header { display: flex; align-items: flex-start; gap: 8px; }
    .context { display: grid; flex: 1; gap: 8px; min-width: 0; }
    .subject { margin: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
    .quote { display: grid; gap: 4px; margin: 0; }
    .quote figcaption { display: flex; align-items: center; gap: 5px; color: var(--muted); font: var(--type-caption)/1.4 var(--stack-code); --icon-size: 11px; }
    .quote pre { max-height: 200px; margin: 0; padding: 8px 10px; overflow: auto; border-radius: var(--radius-control); background: var(--diff-buffer); font: var(--type-code)/var(--code-leading) var(--stack-code); white-space: pre; }
    .close { display: grid; place-items: center; flex: none; width: 28px; height: 28px; margin: -2px -6px 0 0; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 16px; }
    @media (hover: hover) { .close:hover { background: var(--interaction-hover); color: var(--text); } }
    .close:focus-visible, .post-edit:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    .detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 8px 0 0 -8px; padding-block-end: 10px; border-block-end: 1px solid var(--rule); }
    .tip { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; color: var(--muted); font-size: var(--type-caption); --icon-size: 12px; }

    .posts { display: grid; gap: 20px; margin: 16px 0 0; padding: 0; list-style: none; }
    .byline { display: flex; align-items: baseline; gap: 8px; min-height: 24px; margin: 0 0 4px; color: var(--muted); font-size: var(--type-caption); }
    .author { color: var(--text); font-size: var(--type-ui); font-weight: 500; }
    .agent { padding: 0 5px; border: 1px solid var(--border); border-radius: var(--radius-sm); line-height: 16px; }
    .post-edit { margin-inline-start: auto; padding: 2px 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
    @media (hover: hover) and (pointer: fine) {
        .post-edit { opacity: 0; }
        .post:hover .post-edit, .post:focus-within .post-edit { opacity: 1; }
        .post-edit:hover { background: var(--interaction-hover); color: var(--text); }
    }

    .compose { display: grid; gap: 10px; margin-top: 12px; }
    .reply { display: grid; gap: 8px; margin-top: 24px; }
    .post.editing { display: grid; gap: 8px; }
    .compose-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
    .hint { flex: 1; min-width: 0; color: var(--muted); font-size: var(--type-caption); }
    .hint code { font: var(--type-caption)/1 var(--stack-code); }

    @container annotations (max-width: 620px) {
        /* too narrow for two columns: the open note takes the whole view */
        .layout.open { grid-template-columns: minmax(0, 1fr); }
        .layout.open .index { display: none; }
        .hint { display: none; }
    }
    @media (hover: hover) { .row:not(.current):not(.checked):hover { background: var(--interaction-hover); } }
    .row > button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    @media (pointer: coarse), (max-width: 600px) {
        .row > button { min-height: 44px; }
        .check-slot { width: 40px; height: 48px; }
        .close { width: 44px; height: 44px; }
        .post-edit { min-height: 36px; }
    }
</style>
