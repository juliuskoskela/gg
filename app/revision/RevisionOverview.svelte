<script lang="ts">
    import { untrack } from "svelte";

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

    interface Props {
        revs: Extract<RevsResult, { type: "Detail" }>;
        readOnly?: boolean;
    }

    let { revs, readOnly = false }: Props = $props();
    let editing = $state(false);
    let editableDescription = $state("");
    let baselineDescription = $state("");
    let previousKey = $state("");
    let resetAuthor = $state(false);
    let textarea: HTMLTextAreaElement | undefined = $state();
    let descriptionLink: HTMLButtonElement | undefined = $state();

    async function beginEditing() { editing = true; await tick(); textarea?.focus(); }
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
    let singleton = $derived(revs.headers.length === 1);
    let newest = $derived(revs.headers[0]);
    let immutable = $derived(newest.is_immutable && !$ignoreToggled);
    let canEdit = $derived(singleton && !immutable && !readOnly);
    let incomingDescription = $derived(newest.description.lines.join("\n"));
    let emptyWorkingCopy = $derived(canEdit && newest.is_working_copy && !incomingDescription);
    let key = $derived(revisionIdentity(revs, repositoryScope($repoConfigEvent)));
    $effect.pre(() => {
        let nextKey = key, description = incomingDescription;
        untrack(() => {
            if (nextKey !== previousKey) {
                let draft = get(descriptionDrafts)[nextKey];
                editableDescription = draft ?? description;
                editing = draft !== undefined;
                resetAuthor = false;
            } else if (editableDescription === baselineDescription) {
                editableDescription = description;
            }
            previousKey = nextKey;
            baselineDescription = description;
        });
    });
    let showEditor = $derived(canEdit && (editing || emptyWorkingCopy));
    let mutator = $derived(new RevisionMutator(revs.headers, $ignoreToggled));
    // an empty description that can be edited is an invitation, not a status
    let title = $derived(singleton ? newest.description.lines[0] || (canEdit ? "Add a description" : newest.is_working_copy ? "Working copy" : "No description set") : `${revs.headers.length} revisions`);
    let descriptionBody = $derived(incomingDescription.split("\n").slice(1).join("\n").trim());
    let changed = $derived(editableDescription !== baselineDescription || resetAuthor);
    $effect.pre(() => {
        let draftKey = key, description = editableDescription, baseline = baselineDescription;
        if (!draftKey) return;
        untrack(() => descriptionDrafts.update(drafts => {
            let next = { ...drafts };
            if (description !== baseline) next[draftKey] = description;
            else delete next[draftKey];
            return next;
        }));
    });
    $effect.pre(() => {
        if (editing && textarea) tick().then(() => { if (editing && document.activeElement?.tagName !== "TEXTAREA") textarea?.focus(); });
    });
</script>

<div class="overview-content">
    {#if !showEditor}
        <div class="revision-heading"><h2 class:undescribed={singleton && !incomingDescription} tabindex="-1"><EditableText text={title} label="Edit revision description" editable={canEdit} affordance onEdit={beginEditing} bind:element={descriptionLink} /></h2></div>
    {/if}
    {#if singleton}
        {#if showEditor}
            <div class="description-editor">
            <TextAreaField id="revision-description" className="description-field" bind:element={textarea} label="Revision description" placeholder="Describe this change…" spellcheck="false" disabled={!canEdit} bind:value={editableDescription} oninput={() => editing = true} ondragenter={dragOverWidget} ondragover={dragOverWidget} onkeydown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } if (event.key === "Escape") { event.stopPropagation(); cancel(); } }} />
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
