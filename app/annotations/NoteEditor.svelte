<script lang="ts">
    import { tick } from "svelte";
    import Markdown from "./Markdown.svelte";

    export let value: string;
    export let label: string;
    export let placeholder = "";
    export let rows = 6;
    /** changes whenever the editor should take focus */
    export let focusKey: unknown = undefined;
    export let onSubmit: () => void;
    export let onCancel: (() => void) | null = null;

    let preview = false;
    let field: HTMLTextAreaElement | undefined;
    let previous: unknown = undefined;
    $: if (focusKey !== undefined && focusKey !== previous) { previous = focusKey; focus(); }
    $: if (!value.trim()) preview = false;

    async function focus() {
        preview = false;
        await tick();
        field?.focus();
        field?.setSelectionRange(field.value.length, field.value.length);
    }

    function keydown(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSubmit(); }
        else if (event.key === "Escape" && onCancel) { event.preventDefault(); event.stopPropagation(); onCancel(); }
    }
</script>

<div class="note-editor">
    <div class="tabs" role="group" aria-label="{label} editor">
        <button type="button" aria-pressed={!preview} on:click={focus}>Write</button>
        <button type="button" aria-pressed={preview} disabled={!value.trim()} on:click={() => preview = true}>Preview</button>
    </div>
    {#if preview}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions (keyboard users can scroll a long preview and still save) -->
        <div class="preview" role="region" aria-label="Preview" tabindex="0" on:keydown={keydown}><Markdown source={value} /></div>
    {:else}
        <textarea bind:this={field} bind:value aria-label={label} {placeholder} {rows} on:keydown={keydown}></textarea>
    {/if}
</div>

<style>
    .note-editor { display: grid; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
    .note-editor:focus-within { border-color: var(--field-focus-border); }
    .tabs { display: flex; gap: 2px; padding: 3px; border-block-end: 1px solid var(--rule); }
    .tabs button { min-height: 24px; padding: 2px 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted); font: 500 var(--type-caption)/1 var(--stack-ui); cursor: pointer; }
    .tabs button[aria-pressed="true"] { background: var(--interaction-selected); color: var(--text-strong); }
    .tabs button:disabled { color: var(--text-disabled); cursor: default; }
    @media (hover: hover) { .tabs button:not(:disabled):not([aria-pressed="true"]):hover { background: var(--interaction-hover); color: var(--text); } }
    .tabs button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -1px; }
    textarea { box-sizing: border-box; width: 100%; min-height: 0; margin: 0; padding: 8px 10px; border: 0; border-radius: 0 0 var(--radius-control) var(--radius-control); background: transparent; color: var(--text); font: var(--type-body)/1.55 var(--stack-ui); resize: vertical; }
    textarea:focus-visible { outline: none; background: transparent; }
    .preview { min-height: 6.2em; max-height: 50dvh; overflow: auto; padding: 8px 10px; }
    .preview:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    @media (pointer: coarse), (max-width: 600px) { .tabs button { min-height: 36px; padding-inline: 12px; } textarea { font-size: max(16px, var(--type-body)); } }
</style>
