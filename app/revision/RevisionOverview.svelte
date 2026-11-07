<script lang="ts">
    import { revisionIdentity } from "./data";
    import { repositoryScope } from "../workspace/repository";
    import { tick } from "svelte";
    import { get } from "svelte/store";
    import type { RevsResult } from "../messages/RevsResult";
    import { descriptionDrafts, dragOverWidget, ignoreToggled, currentMutation, repoConfigEvent } from "../stores";
    import RevisionMutator from "../mutators/RevisionMutator";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import EditableText from "../controls/EditableText.svelte";
    import TextAreaField from "../controls/TextAreaField.svelte";
    import RevisionMetadata from "./RevisionMetadata.svelte";

    export let revs: Extract<RevsResult, { type: "Detail" }>;
    export let readOnly = false;
    let editing = false;
    let editableDescription = "";
    let baselineDescription = "";
    let previousKey = "";
    let resetAuthor = false;
    let textarea: HTMLTextAreaElement | undefined;
    let descriptionLink: HTMLButtonElement | undefined;

    async function beginEditing() { editing = true; await tick(); textarea?.focus(); }
    $: singleton = revs.headers.length === 1;
    $: newest = revs.headers[0];
    $: canEdit = singleton && !immutable && !readOnly;
    $: emptyWorkingCopy = canEdit && newest.is_working_copy && !incomingDescription;
    $: showEditor = canEdit && (editing || emptyWorkingCopy);
    $: immutable = newest.is_immutable && !$ignoreToggled;
    $: mutator = new RevisionMutator(revs.headers, $ignoreToggled);
    $: key = revisionIdentity(revs, repositoryScope($repoConfigEvent));
    $: incomingDescription = newest.description.lines.join("\n");
    // an empty description that can be edited is an invitation, not a status
    $: title = singleton ? newest.description.lines[0] || (canEdit ? "Add a description" : newest.is_working_copy ? "Working copy" : "No description set") : `${revs.headers.length} revisions`;
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
        tick().then(() => { if (emptyWorkingCopy) textarea?.focus(); else descriptionLink?.focus(); });
    }
    function cancel() {
        editableDescription = incomingDescription;
        resetAuthor = false;
        editing = false;
        focusEditButton();
    }
    async function save() {
        if (!changed || !canEdit || $currentMutation) return;
        let savingKey = key;
        if (await mutator.onDescribe(editableDescription, resetAuthor)) {
            descriptionDrafts.update(drafts => { let next = { ...drafts }; delete next[savingKey]; return next; });
            if (savingKey === key || !changed) { editing = false; resetAuthor = false; focusEditButton(); }
        }
    }
    $: if (editing && textarea) tick().then(() => { if (editing && document.activeElement?.tagName !== "TEXTAREA") textarea?.focus(); });
</script>

<div class="overview-content">
    {#if !showEditor}
        <div class="revision-heading"><h2 class:undescribed={singleton && !incomingDescription} tabindex="-1"><EditableText text={title} label="Edit revision description" editable={canEdit} affordance onEdit={beginEditing} bind:element={descriptionLink} /></h2></div>
    {/if}
    {#if singleton}
        {#if showEditor}
            <div class="description-editor">
            <TextAreaField id="revision-description" className="description-field" bind:element={textarea} label="Revision description" placeholder="Describe this change…" spellcheck="false" disabled={!canEdit} bind:value={editableDescription} on:input={() => editing = true} on:dragenter={dragOverWidget} on:dragover={dragOverWidget} on:keydown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } if (event.key === "Escape") { event.stopPropagation(); cancel(); } }} />
            {#if editing || changed}<div class="description-commands">
                <label class="reset-author"><input type="checkbox" bind:checked={resetAuthor} disabled={immutable} />Reset author</label>
                <ActionWidget secondary tip="Cancel description edit" onClick={cancel}>Cancel</ActionWidget>
                <ActionWidget primary tip="Save revision description" onClick={save} disabled={immutable || !changed || !!$currentMutation}>Save</ActionWidget>
            </div>{/if}</div>
        {:else}
            {#if descriptionBody}<div class="description-display"><p class="description-body"><EditableText text={descriptionBody} label="Edit description body" editable={canEdit} onEdit={beginEditing} /></p></div>{/if}
        {/if}
    {:else}
        <div class="description-list">{#each revs.headers as header}<p class:undescribed={!header.description.lines.join("\n")}>{header.description.lines.join("\n") || "(no description set)"}</p>{/each}</div>
    {/if}
    <RevisionMetadata {revs} />
</div>

<style>
    .overview-content { display: flex; flex-direction: column; align-items: stretch; gap: var(--gap-group); width: 100%; min-width: 0; padding: 14px var(--panel-inset) 16px; }
    .revision-heading { display: flex; align-items: start; gap: 12px; flex-shrink: 0; min-width: 0; }
    h2 { flex: 1; min-width: 0; margin: 0; max-width: var(--prose-measure); color: var(--text-strong); font: var(--font-title); overflow-wrap: anywhere; user-select: text; pointer-events: auto; }
    h2.undescribed { color: var(--muted); font-weight: var(--weight-regular); }
    .description-display, .description-list { min-width: 0; }
    .description-body, .description-list p { margin: 0; max-width: var(--prose-measure); color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; font: var(--font-prose); user-select: text; pointer-events: auto; }
    .description-list { display: grid; gap: var(--gap-row); }
    .description-list p { font: var(--font-body); }
    .description-list .undescribed { color: var(--muted); }
    .overview-content > :global(.revision-metadata) { margin-block-start: calc(var(--gap-section) - var(--gap-group)); padding-block-start: var(--gap-section); border-block-start: 1px solid var(--rule); }
    .description-editor { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .description-editor :global(.description-field) { min-height: 144px; }
    .description-commands { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
    .reset-author { display: inline-flex; align-items: center; gap: 6px; margin-inline-end: auto; font: var(--font-body); color: var(--text); }
    @media (pointer: coarse), (max-width: 600px) { .reset-author { min-height: 44px; } }
</style>
