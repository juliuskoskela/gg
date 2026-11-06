<script lang="ts">
    import Icon from "./Icon.svelte";
    export let text: string;
    export let label: string;
    export let editable = true;
    /** shows the pencil at rest; use it on the one field that names the edit, not on every paragraph */
    export let affordance = false;
    export let onEdit: () => void;
    export let element: HTMLButtonElement | undefined = undefined;
</script>

{#if editable}
    <button class="editable-text" class:affordance type="button" aria-label={label} title={label} bind:this={element} on:click={onEdit}>{text}{#if affordance}<span class="edit-glyph" aria-hidden="true"><Icon name="edit-2" /></span>{/if}</button>
{:else}
    <span class="read-only-text">{text}</span>
{/if}

<style>
    .editable-text, .read-only-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: inherit; color: inherit; }
    /* reads as text until approached: a field's tint on hover says it can be changed in place */
    .editable-text { display: inline; max-width: 100%; margin: -2px -6px; padding: 2px 6px; border: 0; border-radius: var(--radius-control); background: transparent; text-align: start; cursor: text; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
    .edit-glyph { display: inline-flex; margin-inline-start: 8px; vertical-align: -1px; color: var(--muted); opacity: .7; --icon-size: 13px; }
    .editable-text:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: 1px; }
    @media (hover: hover) {
        .editable-text:hover { background: var(--hover); color: var(--text-strong); }
        .editable-text:hover .edit-glyph { color: var(--text); opacity: 1; }
    }
    .editable-text:focus-visible .edit-glyph { opacity: 1; }
    .editable-text:active { background: var(--active); }
</style>
