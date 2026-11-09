<script lang="ts">
    import TextField from "../TextField.svelte";
    import TextAreaField from "../TextAreaField.svelte";
    interface Props {
        multiline?: boolean;
        onEvent: (event: Event) => void;
    }

    let { multiline = false, onEvent }: Props = $props();
    let value = $state("Initial text");
    let input = $state<HTMLInputElement>();
    let textarea = $state<HTMLTextAreaElement>();
</script>

{#if multiline}
    <TextAreaField label="Description" placeholder="Describe this change" rows={4} bind:element={textarea} bind:value className="description-field" oninput={onEvent} onchange={onEvent} onkeydown={onEvent} onfocus={onEvent} onblur={onEvent} ondragenter={onEvent} ondragover={onEvent} />
{:else}
    <TextField label="Find a file" type="search" placeholder="Find a file…" bind:element={input} bind:value className="search-field" oninput={onEvent} onchange={onEvent} onkeydown={onEvent} onfocus={onEvent} onblur={onEvent} ondragenter={onEvent} ondragover={onEvent} />
{/if}
<output aria-label="Bound value">{value}</output>
<button onclick={() => value = "Updated text"}>Replace value</button>
<button onclick={() => (multiline ? textarea : input)?.focus()}>Focus field</button>
