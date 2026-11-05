<script lang="ts">
    import TextField from "../TextField.svelte";
    import TextAreaField from "../TextAreaField.svelte";
    export let multiline = false;
    export let onEvent: (event: Event) => void;
    let value = "Initial text";
    let input: HTMLInputElement | undefined;
    let textarea: HTMLTextAreaElement | undefined;
</script>

{#if multiline}
    <TextAreaField label="Description" placeholder="Describe this change" rows={4} bind:element={textarea} bind:value className="description-field" on:input={onEvent} on:change={onEvent} on:keydown={onEvent} on:focus={onEvent} on:blur={onEvent} on:dragenter={onEvent} on:dragover={onEvent} />
{:else}
    <TextField label="Find a file" type="search" placeholder="Find a file…" bind:element={input} bind:value className="search-field" on:input={onEvent} on:change={onEvent} on:keydown={onEvent} on:focus={onEvent} on:blur={onEvent} on:dragenter={onEvent} on:dragover={onEvent} />
{/if}
<output aria-label="Bound value">{value}</output>
<button on:click={() => value = "Updated text"}>Replace value</button>
<button on:click={() => (multiline ? textarea : input)?.focus()}>Focus field</button>
