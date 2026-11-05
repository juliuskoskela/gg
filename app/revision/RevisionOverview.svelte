<script lang="ts">
    import { revisionIdentity } from "./data";
    import { repositoryScope } from "../workspace/repository";
    import { tick } from "svelte";
    import { get } from "svelte/store";
    import type { RevsResult } from "../messages/RevsResult";
    import { descriptionDrafts, dragOverWidget, ignoreToggled, currentMutation, repoConfigEvent } from "../stores";
    import RevisionMutator from "../mutators/RevisionMutator";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import RevisionActions from "../RevisionActions.svelte";
    import RevisionMetadata from "./RevisionMetadata.svelte";

    export let revs: Extract<RevsResult, { type: "Detail" }>;
    export let readOnly = false;
    let editing = false;
    let editableDescription = "";
    let baselineDescription = "";
    let previousKey = "";
    let resetAuthor = false;
    let textarea: HTMLTextAreaElement;

    async function beginEditing() { editing = true; await tick(); textarea?.focus(); }
    $: singleton = revs.headers.length === 1;
    $: newest = revs.headers[0];
    $: immutable = newest.is_immutable && !$ignoreToggled;
    $: mutator = new RevisionMutator(revs.headers, $ignoreToggled);
    $: key = revisionIdentity(revs, repositoryScope($repoConfigEvent));
    $: incomingDescription = newest.description.lines.join("\n");
    $: title = singleton ? newest.description.lines[0] || (newest.is_working_copy ? "Working copy" : "No description set") : `${revs.headers.length} revisions`;
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

<div class="overview-content">
    <div class="revision-heading">
        <h2 class:undescribed={singleton && !incomingDescription} tabindex="-1">{title}</h2>
        <div class="description-tools">
            {#if singleton && !immutable && !editing && !readOnly}<ActionWidget secondary tip="Edit revision description" onClick={beginEditing}><Icon name="edit-2" /><span>Edit description</span></ActionWidget>{/if}
            {#if !readOnly}<RevisionActions headers={revs.headers} hasChanges={revs.changes.length + revs.conflicts.length > 0} compact />{/if}
        </div>
    </div>
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
    <RevisionMetadata {revs} />
</div>

<style>
    .overview-content { display: flex; flex-direction: column; align-items: stretch; gap: 20px; width: 100%; min-width: 0; padding: 16px; }
    .revision-heading { display: flex; align-items: start; gap: 12px; flex-shrink: 0; min-width: 0; }
    h2 { flex: 1; min-width: 0; margin: 3px 0 0; max-width: 80ch; font-size: var(--type-title); font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; user-select: text; pointer-events: auto; }
    h2.undescribed { color: var(--muted); font-weight: 400; }
    .description-tools { margin-inline-start: auto; display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; gap: 4px; }
    .description-tools > :global(button) { font-size: var(--type-ui); }
    .description-display, .description-list { min-width: 0; }
    .description-body, .description-list p { margin: 0; max-width: 80ch; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--type-body); line-height: 1.65; user-select: text; pointer-events: auto; }
    .description-list { display: grid; gap: 12px; }
    .description-list .undescribed { color: var(--muted); }
    .overview-content > :global(.revision-metadata) { padding-block-start: 20px; border-block-start: 1px solid var(--rule); }
    .description-editor { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .field-label { font-size: var(--type-ui); color: var(--muted); }
    textarea { width: 100%; min-height: 144px; resize: vertical; font-size: var(--type-body); line-height: 1.65; padding: 10px; }
    .description-commands { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
    .reset-author { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: auto; font-size: var(--type-ui); color: var(--text); }
    @container overview (max-width: 520px) { .revision-heading { flex-wrap: wrap; gap: 8px; } .revision-heading h2 { flex-basis: 100%; } .description-tools { margin-inline-start: auto; } }
    @media (pointer: coarse), (max-width: 600px) { textarea { font-size: 16px; } .reset-author { min-height: 44px; } }
</style>
