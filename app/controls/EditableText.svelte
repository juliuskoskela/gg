<script lang="ts">
    export let text: string;
    export let label: string;
    export let editable = true;
    export let onEdit: () => void;
    export let element: HTMLButtonElement | undefined = undefined;
</script>

{#if editable}
    <button class="editable-text" type="button" aria-label={label} title="Click to edit" bind:this={element} on:click={onEdit}>{text}</button>
{:else}
    <span class="read-only-text">{text}</span>
{/if}

<style>
    .editable-text, .read-only-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: inherit; color: inherit; }
    .editable-text { display: inline; max-width: 100%; margin: -3px -5px; padding: 3px 5px; border: 0; border-radius: var(--radius-control); background: transparent; text-align: start; cursor: pointer; }
    .editable-text:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: 1px; }
    @media (hover: hover) { .editable-text:hover { background: var(--hover); color: var(--text-strong); } }
    .editable-text:active { background: var(--active); }
</style>
