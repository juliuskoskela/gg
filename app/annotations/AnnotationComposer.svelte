<script lang="ts">
    import { onMount, tick } from "svelte";
    import ModalDialog from "../shell/ModalDialog.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import TextAreaField from "../controls/TextAreaField.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import Icon from "../controls/Icon.svelte";
    import Markdown from "./Markdown.svelte";
    import { anchorIcon, anchorLabel, type AnchorDraft } from "./anchors";
    import { annotationError, createAnnotation } from "./store";

    export let draft: AnchorDraft;
    export let onClose: () => void;

    let body = "";
    let preview = false;
    let saving = false;
    let error = "";
    let field: HTMLTextAreaElement | undefined;
    let titles = { revision: "Annotate change", bookmark: "Annotate bookmark", file: "Annotate file", lines: "Annotate lines" };
    $: anchor = draft.anchor;
    $: empty = !body.trim();

    onMount(() => field?.focus());

    async function save() {
        if (empty || saving) return;
        saving = true;
        error = "";
        if (await createAnnotation(draft, body)) onClose();
        else error = $annotationError || "The note couldn’t be saved.";
        saving = false;
    }

    async function showWrite() {
        preview = false;
        await tick();
        field?.focus();
    }

    function keydown(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
        }
    }
</script>

<ModalDialog title={titles[anchor.kind]} on:cancel={onClose}>
    <div class="composer">
        <p class="target"><Icon name={anchorIcon(anchor)} /><span class="label">{anchorLabel(anchor)}</span>{#if draft.subject}<span class="subject">{draft.subject}</span>{/if}</p>
        {#if anchor.kind === "lines" && anchor.quote}
            <pre class="quote" aria-label="Annotated code">{anchor.quote}</pre>
        {/if}
        <div class="mode">
            <ToggleTray label="Note editor">
                <ToggleItem text="Write" on={!preview} onClick={showWrite} />
                <ToggleItem text="Preview" on={preview} disabled={empty} onClick={() => preview = true} />
            </ToggleTray>
            <span class="hint">Markdown</span>
        </div>
        {#if preview}
            <div class="preview" role="region" aria-label="Preview"><Markdown source={body} /></div>
        {:else}
            <TextAreaField bind:element={field} bind:value={body} label="Note" className="note-field" rows={7} placeholder="What did you notice?" on:keydown={keydown} />
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <p class="privacy">Saved on this computer only. Nothing is added to the repository.</p>
    </div>
    <svelte:fragment slot="commands">
        <ActionWidget safe secondary onClick={onClose}>Cancel</ActionWidget>
        <ActionWidget safe primary disabled={empty || saving} onClick={save}>Save note</ActionWidget>
    </svelte:fragment>
</ModalDialog>

<style>
    .composer { grid-column: 1 / -1; display: grid; gap: 10px; min-width: 0; }
    .target { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin: 0; font-size: var(--type-ui); }
    .target > :global(svg) { align-self: center; --icon-size: 14px; color: var(--muted); }
    .label { flex: none; font-family: var(--stack-code); font-size: var(--type-code); }
    .subject { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
    .quote { max-height: 140px; margin: 0; padding: 8px 10px; overflow: auto; border-radius: var(--radius-control); background: var(--diff-buffer); color: var(--text); font: var(--type-code)/var(--code-leading) var(--stack-code); white-space: pre; }
    .mode { display: flex; align-items: center; gap: 12px; }
    .hint, .privacy { margin: 0; color: var(--muted); font-size: var(--type-caption); }
    .composer :global(.note-field) { min-height: 150px; font-size: var(--type-body); }
    .preview { min-height: 150px; max-height: 50dvh; overflow: auto; padding: 8px 10px; border: 1px solid var(--rule); border-radius: var(--radius-control); }
    .error { margin: 0; color: var(--negative); font-size: var(--type-ui); }
</style>
