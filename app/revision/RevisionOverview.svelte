<script lang="ts">
    import { revisionIdentity } from "./data";
    import { revisionStatuses, bookmarkStatus } from "../revisionStatus";
    import { repositoryScope } from "../workspace/repository";
    import { tick } from "svelte";
    import { get } from "svelte/store";
    import type { RevsResult } from "../messages/RevsResult";
    import { descriptionDrafts, dragOverWidget, ignoreToggled, currentMutation, repoConfigEvent } from "../stores";
    import RevisionMutator from "../mutators/RevisionMutator";
    import RevisionObject from "../objects/RevisionObject.svelte";
    import BookmarkObject from "../objects/BookmarkObject.svelte";
    import AuthorSpan from "../controls/AuthorSpan.svelte";
    import TimestampSpan from "../controls/TimestampSpan.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Zone from "../objects/Zone.svelte";

    export let revs: Extract<RevsResult, { type: "Detail" }>;
    export let onEditingChange: (value: boolean) => void = () => {};
    let editing = false;
    let width = 1000;
    let editableDescription = "";
    let baselineDescription = "";
    let previousKey = "";
    let resetAuthor = false;
    let textarea: HTMLTextAreaElement;
    $: onEditingChange(editing);

    export async function beginEditing() { editing = true; await tick(); textarea?.focus(); }
    $: singleton = revs.headers.length === 1;
    $: newest = revs.headers[0];
    $: oldest = revs.headers[revs.headers.length - 1];
    $: immutable = newest.is_immutable && !$ignoreToggled;
    $: mutator = new RevisionMutator(revs.headers, $ignoreToggled);
    $: key = revisionIdentity(revs, repositoryScope($repoConfigEvent));
    $: incomingDescription = oldest.description.lines.join("\n");
    $: descriptionBody = incomingDescription.split("\n").slice(1).join("\n").trim();
    $: {
        if (key !== previousKey) {
            let draft = get(descriptionDrafts)[key];
            editableDescription = draft ?? incomingDescription;
            editing = draft !== undefined;
            resetAuthor = false;
        } else if (editableDescription === baselineDescription) {
            editableDescription = incomingDescription;
        }
        previousKey = key;
        baselineDescription = incomingDescription;
    }
    $: changed = editableDescription !== baselineDescription || resetAuthor;
    $: if (key) {
        descriptionDrafts.update(drafts => {
            let next = { ...drafts };
            if (editableDescription !== baselineDescription) next[key] = editableDescription;
            else delete next[key];
            return next;
        });
    }
    $: authors = [...new Map(revs.headers.map(header => [header.author.email, header.author])).values()];
    $: bookmarks = newest.refs.filter(ref => ref.type === "LocalBookmark" || ref.type === "RemoteBookmark");

    function focusEditButton() {
        tick().then(() => document.querySelector<HTMLButtonElement>('button[aria-label="Edit revision description"]')?.focus());
    }
    function cancel() {
        editableDescription = incomingDescription;
        resetAuthor = false;
        editing = false;
        focusEditButton();
    }
    async function save() {
        if (!changed || immutable || $currentMutation) return;
        let savingKey = key;
        if (await mutator.onDescribe(editableDescription, resetAuthor)) {
            descriptionDrafts.update(drafts => { let next = { ...drafts }; delete next[savingKey]; return next; });
            if (savingKey === key || !changed) { editing = false; resetAuthor = false; focusEditButton(); }
        }
    }
    $: if (editing && textarea) tick().then(() => { if (editing && document.activeElement?.tagName !== "TEXTAREA") textarea?.focus(); });
</script>

<div class="overview-content" bind:clientWidth={width}>
    {#if singleton}
        {#if editing}
            <div class="description-editor"><label class="field-label" for="revision-description">Description</label>
            <textarea id="revision-description" bind:this={textarea} aria-label="Revision description" placeholder="Describe this change…" spellcheck="false" disabled={immutable} bind:value={editableDescription} on:dragenter={dragOverWidget} on:dragover={dragOverWidget} on:keydown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } if (event.key === "Escape") { event.stopPropagation(); cancel(); } }}></textarea>
            <div class="description-commands">
                <label class="reset-author"><input type="checkbox" bind:checked={resetAuthor} disabled={immutable} />Reset author</label>
                <ActionWidget secondary tip="Cancel description edit" onClick={cancel}>Cancel</ActionWidget>
                <ActionWidget primary tip="Save revision description" onClick={save} disabled={immutable || !changed || !!$currentMutation}>Save</ActionWidget>
            </div></div>
        {:else}
            {#if descriptionBody}<div class="description-display"><p class="description-body">{descriptionBody}</p></div>{/if}
        {/if}
    {:else}
        <div class="description-list">{#each revs.headers as header}<p class:undescribed={!header.description.lines.join("\n")}>{header.description.lines.join("\n") || "(no description set)"}</p>{/each}</div>
    {/if}
    {#if revs.headers.some(header => revisionStatuses(header).length)}
        <dl class="revision-statuses" aria-label="Revision status">{#each revs.headers as header}{#if revisionStatuses(header).length}<div><dt>{singleton ? "Status" : header.id.change.prefix}</dt><dd>{revisionStatuses(header).join(" · ")}</dd></div>{/if}{/each}</dl>
    {/if}
    <dl class="metadata">
        <div class="metadata-field"><dt>{authors.length === 1 ? "Author" : "Authors"}</dt><dd class="authors">{#each authors as author}<span class="author-detail"><AuthorSpan {author} /></span>{/each}</dd></div>
        <div class="metadata-field"><dt>Authored</dt><dd><TimestampSpan timestamp={newest.author.timestamp} /></dd></div>
        {#if singleton}<div class="metadata-field"><dt>Change</dt><dd class="commit-identity" title={newest.id.change.hex}><IdSpan selectable id={newest.id.change} /></dd></div><div class="metadata-field"><dt>Commit</dt><dd class="commit-identity" title={newest.id.commit.hex}><IdSpan selectable id={newest.id.commit} /></dd></div>{/if}
    </dl>
    {#if bookmarks.length}<div class="bookmarks" aria-label="Revision bookmarks">{#each bookmarks as ref}{#if ref.type === "LocalBookmark" || ref.type === "RemoteBookmark"}<div class="bookmark"><BookmarkObject {ref} header={newest} /><span class="bookmark-status">{bookmarkStatus(ref)}</span></div>{/if}{/each}</div>{/if}
    {#if revs.parents.length}
        <Zone operand={{ type: "Merge", header: oldest }} let:target>
            <div class="parents" class:target><h3 class="field-label">{revs.parents.length === 1 ? "Parent" : "Parents"}</h3><div class="parent-list">{#each revs.parents as parent}<RevisionObject header={parent} child={oldest} selected={false} noBookmarks expanded={width < 600} />{/each}</div></div>
        </Zone>
    {/if}
</div>

<style>
    .overview-content { min-width: 0; width: 100%; padding: 0 var(--pane-inset) 12px; display: flex; flex-direction: column; }
    .description-display { min-width: 0; user-select: text; pointer-events: auto; }
    .description-body, .description-list p { margin: 8px 0 0; max-width: 80ch; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--type-body); font-weight: 400; line-height: 1.65; user-select: text; pointer-events: auto; }
    .description-list p.undescribed { font-size: var(--type-ui); font-weight: 400; color: var(--muted); }
    .description-list { display: grid; gap: 8px; }
    .revision-statuses { display: grid; gap: 4px; margin: 12px 0 0; }
    .revision-statuses > div { display: flex; flex-wrap: wrap; gap: 4px 8px; }
    .bookmark-status { display: block; color: var(--muted); font-size: var(--type-caption); line-height: 1.5; overflow-wrap: anywhere; margin-block-start: 2px; }
    .metadata { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 12px 0 0; min-width: 0; }
    .metadata-field { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    dt, .field-label { margin: 0; font-size: var(--type-caption); font-weight: 400; color: var(--muted); flex-shrink: 0; }
    dd { margin: 0; min-width: 0; font-size: var(--type-ui); line-height: 1.5; overflow-wrap: anywhere; }
    .authors { display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .author-detail { min-width: 0; }
    .authors :global(.author) { white-space: normal; color: var(--text); }
    .commit-identity { font-size: var(--type-caption); }
    .bookmarks { display: flex; flex-wrap: wrap; gap: 4px; margin-block-start: 12px; }
    .bookmark { min-width: 0; max-width: 100%; }
    .bookmark :global(.chip) { max-width: 100%; }
    .bookmark :global(.chip span) { overflow: hidden; text-overflow: ellipsis; }
    .parents { display: flex; align-items: center; gap: 8px; margin-block-start: 8px; min-width: 0; }
    .parent-list { flex: 1; min-width: 0; }
    .parents.target { outline: 2px solid var(--text); outline-offset: -2px; border-radius: var(--radius-control); }
    .description-editor { display: flex; flex-direction: column; min-width: 0; }
    textarea { width: 100%; min-height: 96px; max-height: 240px; resize: vertical; font-size: var(--type-ui); line-height: 1.6; padding: 10px; margin-block-start: 6px; }
    .description-commands { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding-block-start: 6px; }
    .reset-author { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: auto; font-size: var(--type-ui); color: var(--text); }
    @container overview (max-width: 600px) { .parents { display: block; } .parent-list { margin-block-start: 4px; margin-inline: -8px; } }
    @media (pointer: coarse) { textarea { font-size: 16px; } .reset-author { min-height: 44px; } }
    @media (max-width: 600px) { textarea { font-size: 16px; } .overview-content { padding-inline: 12px; }  .metadata { gap: 6px 16px; } }
</style>
