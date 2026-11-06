<script lang="ts">
    import { tick } from "svelte";
    import type { SelectedLineRange } from "@pierre/diffs";
    import type { RevisionDetail } from "../../revision/data";
    import DiffViewer, { type DiffNote } from "../../DiffViewer.svelte";
    import DiffDisplayOptions from "../../revision/DiffDisplayOptions.svelte";
    import ActionWidget from "../../controls/ActionWidget.svelte";
    import TextField from "../../controls/TextField.svelte";
    import TextAreaField from "../../controls/TextAreaField.svelte";
    import SelectWidget from "../../controls/SelectWidget.svelte";
    import Icon from "../../controls/Icon.svelte";
    import ReviewThread from "./ReviewThread.svelte";
    import { captureReview } from "./capture";
    import { anchorLabel, isSeen, lineAnchor, MAX_BYTES, threadStatus, type Anchor, type Subject, type Thread } from "./model";
    import { activeReview, addThread, exportReview, importReview, putReview, reviewEnabled, reviewer, reviews, setReviewer, setSeen, storageWarning } from "./store";

    export let detail: RevisionDetail | null = null;
    export let repository = "";
    let expanded = false;
    let root: HTMLDivElement;
    let reader: DiffViewer | undefined;
    let creating = false;
    let title = "";
    let name = $reviewer.name;
    let subject: Subject["kind"] = "change";
    let fileId = "";
    let previousReview = "";
    let busy = "";
    let error = "";
    let notice = "";
    let tab: "diff" | "discussion" = "diff";
    let width = 1000;
    let importInput: HTMLInputElement;
    let commentElement: HTMLTextAreaElement | undefined;
    let comment = "";
    let draftAnchor: Anchor | null = null;
    let lineStart = "";
    let lineEnd = "";
    let lineSide = "additions";
    let linePicker: HTMLDetailsElement;
    let selectedLine: Extract<Anchor, { kind: "line" }> | null = null;
    let scope: Subject["kind"] = "change";
    let memberCommit = "";
    let filter = "all";
    let inspectedThread = "";
    $: if (detail && detail.headers.length > 1) subject = "revset";
    $: review = $reviews.find(item => item.id === $activeReview) ?? null;
    $: if (review && review.id !== previousReview) {
        previousReview = review.id; fileId = review.snapshot.files[0]?.id ?? "";
        memberCommit = review.snapshot.members[0].commit; scope = review.subject.kind;
        draftAnchor = null; selectedLine = null; comment = ""; inspectedThread = "";
    }
    $: file = review?.snapshot.files.find(item => item.id === fileId) ?? null;
    $: member = review?.snapshot.members.find(item => item.commit === memberCommit);
    $: seen = review ? review.snapshot.files.filter(item => isSeen(review!, item.id, $reviewer.id)).length : 0;
    $: seenFile = review && file ? isSeen(review, file.id, $reviewer.id) : false;
    $: open = review?.threads.filter(item => threadStatus(item) === "open").length ?? 0;
    $: threads = review?.threads.filter(item => filter === "all" || (filter === "file" ? item.anchor.kind === "line" && item.anchor.file === fileId : threadStatus(item) === filter)) ?? [];
    $: notes = (review?.threads ?? []).filter(item => item.anchor.kind === "line" && item.anchor.file === fileId).map(item => {
        let anchor = item.anchor as Extract<Anchor, { kind: "line" }>;
        return { id: item.id, side: anchor.side, line: anchor.end, label: `${threadStatus(item) === "open" ? "Discussion" : threadStatus(item) === "resolved" ? "Resolved" : "Obsolete"} · ${item.posts[0].author.name}: ${item.posts[0].body.slice(0, 100)}`, onClick: () => focusThread(item.id) } satisfies DiffNote;
    });
    $: if (detail && !title && !review) title = detail.headers[0]?.description.lines.join("").trim().slice(0, 240) || "Review changes";
    function fail(cause: unknown) { error = cause instanceof Error ? cause.message : String(cause); }
    function act(action: () => void) { error = ""; try { action(); } catch (cause) { fail(cause); } }
    function identity() { setReviewer(name); if (!name.trim()) throw new Error("Enter your name to join this review."); }
    async function start() {
        if (!detail) return;
        error = ""; busy = "Capturing selected revisions…";
        try { identity(); let frozen = await captureReview(detail, title, repository, { ...$reviewer }, detail.headers.length > 1 ? "revset" : subject, label => busy = label); putReview(frozen); creating = false; tab = "diff"; notice = "Review started. This patch stays fixed while the repository evolves."; }
        catch (cause) { fail(cause); } finally { busy = ""; }
    }
    function changeFile(id: string) { fileId = id; selectedLine = null; inspectedThread = ""; tab = "diff"; }
    function manualLine() {
        if (!file) return;
        act(() => {
            let anchor = lineAnchor(file!, { side: lineSide as "additions" | "deletions", start: Number(lineStart), end: Number(lineEnd || lineStart) });
            selectedLine = anchor; linePicker.open = false; void compose(anchor);
        });
    }
    function selectLine(range: SelectedLineRange | null) { selectedLine = null; if (range && file) act(() => selectedLine = lineAnchor(file!, range)); }
    async function compose(anchor: Anchor) { draftAnchor = anchor; tab = "discussion"; await tick(); commentElement?.focus(); }
    function generalAnchor(): Anchor {
        if (!review || !member) throw new Error("Select a revision to comment on.");
        if (scope === "revset") return { kind: "revset", expression: review.snapshot.members.map(item => item.commit).join(" | "), commits: review.snapshot.members.map(item => item.commit) };
        return scope === "change" ? { kind: "change", change: member.change, observedCommit: member.commit } : { kind: "revision", change: member.change, commit: member.commit };
    }
    function post() { if (!review || !draftAnchor) return; act(() => { identity(); addThread(review!.id, draftAnchor!, comment); comment = ""; draftAnchor = null; selectedLine = null; filter = "all"; notice = "Comment added."; }); }
    async function focusThread(id: string) { inspectedThread = id; filter = "all"; tab = "discussion"; await tick(); document.getElementById(`review-thread-${id}`)?.focus({ preventScroll: false }); }
    async function locate(thread: Thread) {
        if (thread.anchor.kind !== "line") { notice = "This discussion applies to the captured revision selection."; return; }
        fileId = thread.anchor.file; selectedLine = thread.anchor; inspectedThread = thread.id; tab = "diff";
        await tick(); reader?.revealLine({ side: thread.anchor.side, start: thread.anchor.start, end: thread.anchor.end });
    }
    async function ingest(event: Event) {
        let input = event.target as HTMLInputElement;
        let incoming = input.files?.[0]; error = "";
        try { if (!incoming) return; if (incoming.size > MAX_BYTES) throw new Error("Review exceeds the 10 MB limit."); let imported = importReview(await incoming.text()); creating = false; notice = `Imported “${imported.title}”. Captured code is available without the original repository.`; }
        catch (cause) { fail(cause); } finally { input.value = ""; }
    }
    function trap(event: KeyboardEvent) {
        if (!expanded || event.key !== "Tab") return;
        let elements = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest("[hidden],[inert]"));
        let next = event.shiftKey ? elements.at(-1) : elements[0];
        if ((event.shiftKey && document.activeElement === elements[0]) || (!event.shiftKey && document.activeElement === elements.at(-1))) { event.preventDefault(); next?.focus(); }
    }
    async function share() { if (!review) return; error = ""; try { if (await exportReview(review)) notice = "Review exported. Share the JSON file; replies can be imported back into this review."; } catch (cause) { fail(cause); } }
</script>

<svelte:window on:keydown={event => { if (event.key === "Escape" && expanded) expanded = false; }} />
<!-- svelte-ignore a11y_no_noninteractive_element_interactions (expanded review traps keyboard focus like a full-screen dialog) -->
<div class="review-plugin" class:expanded class:narrow={width < 850} bind:clientWidth={width} bind:this={root} role={expanded ? "dialog" : "region"} aria-modal={expanded ? true : undefined} aria-label="Review mode" on:keydown={trap}>
    {#if !$reviewEnabled}<div class="welcome"><h2>Review extension is disabled</h2><p>Enable Review in Settings to continue. Your saved reviews are preserved.</p></div>
    {:else}
        <div class="library-toolbar">
            <div class="library-choice">{#if $reviews.length}<SelectWidget label="Review library" bind:value={$activeReview} options={$reviews.map(item => ({ value: item.id, label: item.title }))} on:change={() => creating = false} let:option>{option.label}</SelectWidget>{:else}<span class="extension-label"><Icon name="message-square" />Review</span>{/if}</div>
            <ActionWidget safe tip={width < 420 ? "New review" : ""} disabled={!!busy} onClick={() => { creating = true; title = detail?.headers[0]?.description.lines.join("").trim().slice(0, 240) || "Review changes"; }}>{#if width < 420}<Icon name="plus" />{:else}New review{/if}</ActionWidget>
            <ActionWidget safe tip={expanded ? "Restore review pane" : "Expand review"} onClick={() => expanded = !expanded}><Icon name={expanded ? "minimize-2" : "maximize-2"} /></ActionWidget>
            <ActionWidget safe disabled={!!busy} onClick={() => importInput.click()}><Icon name="upload" />Import</ActionWidget>
            <input class="file-input" type="file" accept="application/json,.json" aria-label="Import review JSON" bind:this={importInput} on:change={ingest} />
        </div>
        {#if $storageWarning}<p class="feedback warning" role="alert">{$storageWarning}</p>{/if}
        {#if error}<p class="feedback warning" role="alert">{error}</p>{/if}
        <p class="sr-only" aria-live="polite">{notice}</p>
        {#if creating || !review}
            <div class="welcome">
                <Icon name="message-square" /><h2>A conversation around a change</h2>
                <p>Review a frozen patch, keep track of files you’ve seen, and send the discussion as a single file.</p>
                <form class="start-form" on:submit|preventDefault={start}>
                    <label>Review title<TextField label="Review title" bind:value={title} maxlength="240" required /></label>
                    <label>Your name<TextField label="Your name" bind:value={name} maxlength="120" required placeholder="Name shown on your comments" /></label>
                    <label>Attach review to<SelectWidget label="Attach review to" bind:value={subject} options={detail && detail.headers.length > 1 ? [{ value: "revset", label: "Revset · selected revisions" }] : [{ value: "change", label: "Change ID · logical change" }, { value: "revision", label: "Revision · exact commit" }, { value: "revset", label: "Revset · selected revisions" }]} let:option>{option.label}</SelectWidget></label>
                    {#if detail}<div class="selection-context"><span>{detail.headers.length} selected {detail.headers.length === 1 ? "revision" : "revisions"}</span><code>{detail.headers[0]?.id.change.prefix}{detail.headers[0]?.id.change.rest.slice(0, 4)}</code><p>{detail.headers[0]?.description.lines.join("") || "No description"}</p></div>{:else}<p>Select a revision or range in the graph to start. You can also import a review from another GG+ user.</p>{/if}
                    <div class="start-actions">{#if review}<ActionWidget safe onClick={() => creating = false}>Cancel</ActionWidget>{/if}<button class="quiet-primary" type="submit" disabled={!detail || !title.trim() || !name.trim() || !!busy}>{busy || "Start review"}</button></div>
                </form>
                <p class="footnote">Local review extension · no account or server required</p>
            </div>
        {:else}
            <header class="review-heading"><div><h2>{review.title}</h2><p>{review.repository} <span>·</span> {review.snapshot.members.length} {review.snapshot.members.length === 1 ? "revision" : "revisions"} <span>·</span> {review.completedAt ? "Exported" : "Draft"}</p></div><ActionWidget safe onClick={share}><Icon name="download" />Finish & export</ActionWidget></header>
            <div class="review-progress"><div class="progress-copy"><span>{seen} / {review.snapshot.files.length} files seen by you</span><span>{open} open {open === 1 ? "discussion" : "discussions"}</span></div><progress max={Math.max(review.snapshot.files.length, 1)} value={seen} aria-label="Files seen by you"></progress></div>
            <div class="review-identity"><label>Your name<TextField label="Your name" bind:value={name} maxlength="120" placeholder="Enter your name to participate" on:change={() => act(identity)} /></label><details class="snapshot-summary"><summary>Captured selection <Icon name="chevron-down" /></summary><div class="snapshot-details"><p>{anchorLabel(review.subject, review)}</p><ol>{#each review.snapshot.members as revision}<li><strong>{revision.description || "No description"}</strong><span>Change <code>{revision.change}</code></span><span>Commit <code>{revision.commit}</code></span></li>{/each}</ol><p>Comments and seen marks refer to this captured version. Selecting another revision in the graph does not change it.</p></div></details></div>
            <div class="mode-switch" role="group" aria-label="Review surface"><button type="button" aria-pressed={tab === "diff"} on:click={() => tab = "diff"}>Diff <span>{review.snapshot.files.length}</span></button><button type="button" aria-pressed={tab === "discussion"} on:click={() => tab = "discussion"}>Discussion <span>{review.threads.length}</span></button></div>
            <div class="workbench">
                <section class="patch" hidden={width < 850 && tab !== "diff"} aria-label="Review diff">
                    <div class="file-toolbar">
                        <div class="file-choice"><SelectWidget label="Review file" value={fileId} options={review.snapshot.files.map(item => ({ value: item.id, label: `${isSeen(review!, item.id, $reviewer.id) ? "✓ " : ""}${item.change.path.relative_path}` }))} on:change={event => changeFile((event.detail.target as HTMLSelectElement).value)} let:option>{option.label}</SelectWidget></div>
                        {#if file}<label class="seen"><input type="checkbox" checked={seenFile} on:change={event => act(() => { identity(); setSeen(review!.id, file!.id, event.currentTarget.checked); })} />Seen</label>{/if}
                        <DiffDisplayOptions contextAvailable={false} />
                    </div>
                    {#if file}
                        <div class="line-action">{#if selectedLine}<ActionWidget safe onClick={() => compose(selectedLine!)}><Icon name="message-square" />Comment on {selectedLine.side === "deletions" ? "old" : "new"} {selectedLine.start === selectedLine.end ? `line ${selectedLine.start}` : `lines ${selectedLine.start}–${selectedLine.end}`}</ActionWidget><ActionWidget safe tip="Clear selected lines" onClick={() => selectedLine = null}><Icon name="x" /></ActionWidget>{:else}<span>{file.change.has_conflict ? "Conflict markers · use a change or revision comment." : "Select a line number, or"}</span>{#if !file.change.has_conflict}<details class="line-picker" bind:this={linePicker}><summary>Comment on a line</summary><form on:submit|preventDefault={manualLine}><label>Side<SelectWidget label="Line comment side" bind:value={lineSide} options={[{ value: "additions", label: "New" }, { value: "deletions", label: "Old" }]} let:option>{option.label}</SelectWidget></label><label>Start<TextField label="Start line" bind:value={lineStart} inputmode="numeric" pattern="[0-9]+" required /></label><label>End (optional)<TextField label="End line" bind:value={lineEnd} inputmode="numeric" pattern="[0-9]*" /></label><button class="quiet-primary" type="submit">Write comment</button></form></details>{/if}{/if}</div>
                        <!-- svelte-ignore a11y_no_noninteractive_tabindex (the patch scrolls independently) -->
                        <div class="patch-scroll" role="region" aria-label="Captured file diff" tabindex="0">{#key file.id}<DiffViewer bind:this={reader} change={file.change} readingKey={`review:${review.id}:${file.id}`} onSelectLine={file.change.has_conflict ? null : selectLine} lineNotes={notes} />{/key}</div>
                        <footer><code title={file.change.path.relative_path}>{file.change.path.relative_path}</code><span>{review.snapshot.files.indexOf(file) + 1} / {review.snapshot.files.length}</span><ActionWidget safe tip="Next review file" disabled={review.snapshot.files.indexOf(file) === review.snapshot.files.length - 1} onClick={() => changeFile(review!.snapshot.files[review!.snapshot.files.indexOf(file!) + 1].id)}><Icon name="chevron-down" /></ActionWidget></footer>
                    {:else}<div class="empty"><h3>No changed files</h3><p>You can still discuss the selected change.</p></div>{/if}
                </section>
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (the conversation scrolls independently) -->
                <section class="discussion" hidden={width < 850 && tab !== "discussion"} aria-label="Review discussions" tabindex="0">
                    <div class="discussion-heading"><h3>Discussion</h3><SelectWidget label="Filter discussions" bind:value={filter} options={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "obsolete", label: "Obsolete" }, { value: "file", label: "This file" }]} let:option>{option.label}</SelectWidget></div>
                    {#if !draftAnchor}
                        <div class="target-controls"><SelectWidget label="Comment target" bind:value={scope} options={[{ value: "change", label: "Change ID" }, { value: "revision", label: "Revision" }, { value: "revset", label: "Revset" }]} let:option>{option.label}</SelectWidget>
                        {#if scope !== "revset" && review.snapshot.members.length > 1}<SelectWidget label="Comment revision" bind:value={memberCommit} options={review.snapshot.members.map(item => ({ value: item.commit, label: item.description || item.commit.slice(0, 12) }))} let:option>{option.label}</SelectWidget>{/if}
                        <ActionWidget safe onClick={() => act(() => { void compose(generalAnchor()); })}><Icon name="plus" />Comment</ActionWidget></div>
                    {:else}
                        <form class="composer" on:submit|preventDefault={post}><p>{anchorLabel(draftAnchor, review)}</p>{#if draftAnchor.kind === "line"}<pre><code>{draftAnchor.quote}</code></pre>{/if}<TextAreaField label="Review comment" bind:element={commentElement} bind:value={comment} rows="4" maxlength="20000" required placeholder="What should we discuss?" /><div class="composer-actions"><ActionWidget safe onClick={() => draftAnchor = null}>Cancel</ActionWidget><button type="submit" class="quiet-primary" disabled={!comment.trim()}>Add comment</button></div></form>
                    {/if}
                    <div class="thread-list">{#each threads as thread (thread.id)}<div class:inspected={thread.id === inspectedThread}><ReviewThread {review} {thread} onLocate={() => locate(thread)} onError={message => error = message} /></div>{/each}</div>
                    {#if !threads.length}<div class="empty-discussion"><Icon name="message-square" /><h3>{review.threads.length ? "No matching discussions" : "Room for a closer look"}</h3><p>{review.threads.length ? "Choose another filter to see the other conversations." : "Comment on the change as a whole, or select a line number in the diff."}</p></div>{/if}
                    <p class="share-note">Export includes captured code, comments and names. Share it with people who should have access. Names are self-declared.</p>
                </section>
            </div>
        {/if}
    {/if}
</div>

<style>
    @import "../../controls/action.css";
    .review-plugin { container-type: inline-size; display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; color: var(--text); background: var(--surface); pointer-events: auto; font-size: var(--type-ui); }
    .review-plugin.expanded { position: fixed; inset: 0; z-index: 100; height: 100dvh; }
    .library-toolbar { display: flex; gap: 4px; align-items: center; padding: 8px 12px; border-block-end: 1px solid var(--rule); }
    .library-choice { flex: 1; min-width: 0; }
    .library-choice :global(select) { background: transparent; border-color: transparent; }
    .extension-label { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .file-input { display: none; }
    h2, h3, p { margin: 0; }
    h2 { font-size: var(--type-body); line-height: 1.4; font-weight: 500; overflow-wrap: anywhere; }
    h3 { font-size: var(--type-ui); font-weight: 500; }
    p { line-height: 1.6; }
    .welcome { flex: 1; overflow: auto; padding: clamp(20px, 5cqi, 48px); }
    .welcome > :global(svg) { --icon-size: 24px; color: var(--muted); margin-block-end: 16px; }
    .welcome > p { max-width: 48ch; color: var(--muted); margin-block-start: 12px; }
    .start-form { display: grid; gap: 16px; max-width: 460px; margin-block: 28px; }
    label { display: grid; gap: 6px; color: var(--muted); font-size: var(--type-caption); }
    .start-actions, .composer-actions { display: flex; justify-content: end; gap: 6px; }
    .quiet-primary { background: var(--interaction-selected); font-weight: 500; }
    .selection-context { padding-block: 8px; color: var(--muted); font-size: var(--type-caption); }
    .selection-context code { margin-inline-start: 12px; }
    .selection-context p { margin-block-start: 8px; color: var(--text); }
    .footnote { font-size: var(--type-caption); }
    .review-heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 20px 16px 12px; }
    .review-heading > div { flex: 1 1 180px; min-width: 0; }
    .review-heading p { margin-block-start: 4px; color: var(--muted); font-size: var(--type-caption); }
    .review-heading p span { margin-inline: 4px; }
    .review-progress { padding-inline: 16px; }
    .progress-copy { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: var(--type-caption); color: var(--muted); }
    progress { appearance: none; display: block; width: 100%; height: 2px; border: 0; margin-block: 8px 0; background: var(--rule); }
    progress::-webkit-progress-bar { background: var(--rule); }
    progress::-webkit-progress-value { background: var(--muted); }
    progress::-moz-progress-bar { background: var(--muted); }
    .review-identity { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; padding: 12px 16px; }
    .review-identity label { display: flex; align-items: center; flex: 0 1 230px; gap: 8px; white-space: nowrap; }
    .review-identity label :global(input) { background: transparent; border-color: transparent; padding-inline: 4px; }
    .snapshot-summary { position: relative; font-size: var(--type-caption); color: var(--muted); }
    .snapshot-summary summary { display: flex; align-items: center; gap: 6px; min-height: var(--control-height); padding: 4px 6px; border-radius: var(--radius-control); list-style: none; cursor: pointer; }
    .snapshot-summary summary::-webkit-details-marker { display: none; }
    .snapshot-summary summary:hover { background: var(--interaction-hover); color: var(--text); }
    .snapshot-summary summary :global(svg) { --icon-size: 12px; }
    .snapshot-details { position: absolute; inset-block-start: 100%; inset-inline-start: 0; z-index: 3; width: min(420px, 75vw); max-height: 300px; overflow: auto; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-control); box-shadow: var(--shadow-float); }
    .snapshot-details ol { padding: 0; list-style: none; margin-block: 12px; }
    .snapshot-details li { display: grid; gap: 6px; padding-block: 10px; }
    .snapshot-details li + li { border-block-start: 1px solid var(--rule); }
    .snapshot-details strong { color: var(--text); font-weight: 500; }
    .snapshot-details code { font-size: var(--type-caption); user-select: text; overflow-wrap: anywhere; }
    .snapshot-details span { overflow-wrap: anywhere; }
    @media (pointer: coarse), (max-width: 600px) { .snapshot-summary summary { min-height: 44px; } }

    .mode-switch { display: none; padding: 4px 12px 8px; gap: 4px; border-block-end: 1px solid var(--rule); }
    .mode-switch button[aria-pressed=true] { background: var(--interaction-selected); }
    .mode-switch span { margin-inline-start: 4px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .narrow .mode-switch { display: flex; }
    .workbench { flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 34%); border-block-start: 1px solid var(--rule); }
    .narrow .workbench { display: flex; flex-direction: column; border-block-start: 0; }
    .workbench > section { min-width: 0; min-height: 0; }
    .workbench > section[hidden] { display: none; }
    .patch { display: flex; flex-direction: column; }
    .narrow .patch { flex: 1; }
    .file-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
    .file-choice { flex: 1 1 160px; min-width: 0; }
    .file-choice :global(select) { border-color: transparent; background: transparent; }
    .seen { display: flex; align-items: center; gap: 6px; min-height: var(--control-height); color: var(--text); cursor: pointer; }
    input[type=checkbox] { accent-color: var(--muted); width: 14px; height: 14px; }
    .line-action { min-height: 36px; display: flex; align-items: center; flex-wrap: wrap; padding-inline: 16px; gap: 4px; }
    .line-picker { font-size: var(--type-caption); }
    .line-picker summary { min-height: var(--control-height); display: inline-flex; align-items: center; padding: 4px 6px; border-radius: var(--radius-control); cursor: pointer; list-style: none; color: var(--text); }
    .line-picker summary::-webkit-details-marker { display: none; }
    .line-picker summary:hover { background: var(--interaction-hover); }
    .line-picker form { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; padding-block: 8px; }
    .line-picker form > label { width: 90px; }
    @media (pointer: coarse), (max-width: 600px) { .line-picker summary { min-height: 44px; } }
    .line-action > span { font-size: var(--type-caption); color: var(--muted); }
    .patch-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
    footer { display: flex; align-items: center; gap: 12px; padding: 4px 12px; border-block-start: 1px solid var(--rule); color: var(--muted); font-size: var(--type-caption); }
    footer code { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    code { font-family: var(--stack-code); font-size: var(--type-code); }
    .discussion { overflow: auto; overscroll-behavior: contain; border-inline-start: 1px solid var(--rule); padding: 12px 16px; }
    .narrow .discussion { flex: 1; border-inline-start: 0; }
    .discussion-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-block-end: 12px; }
    .discussion-heading :global(select) { border-color: transparent; background: transparent; }
    .target-controls { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-block-end: 8px; }
    .target-controls :global(.wrapper) { flex: 1; min-width: 100px; }
    .composer { padding-block: 8px 16px; }
    .composer > p { color: var(--muted); font-size: var(--type-caption); margin-block-end: 8px; overflow-wrap: anywhere; }
    .composer pre { background: var(--raised); padding: 8px; max-height: 160px; overflow: auto; }
    .composer-actions { margin-block-start: 6px; }
    .thread-list > div + div { border-block-start: 1px solid var(--rule); }
    .inspected { background: color-mix(in srgb, var(--text) 3%, transparent); border-radius: var(--radius-control); }
    .empty { padding: 28px 16px; color: var(--muted); }
    .empty p { margin-block-start: 8px; }
    .empty-discussion { padding-block: 32px; color: var(--muted); }
    .empty-discussion :global(svg) { --icon-size: 20px; margin-block-end: 12px; }
    .empty-discussion h3 { color: var(--text); margin-block-end: 8px; }
    .share-note { margin-block-start: 24px; padding-block: 16px; border-block-start: 1px solid var(--rule); color: var(--muted); font-size: var(--type-caption); }
    .feedback { margin: 0; padding: 8px 16px; font-size: var(--type-caption); overflow-wrap: anywhere; }
    .warning { color: var(--warning); background: var(--raised); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    @media (pointer: coarse), (max-width: 600px) { .seen { min-height: 44px; padding-inline: 4px; } .review-identity { padding-block: 4px 8px; } .review-heading { padding-block-start: 12px; } }
</style>
