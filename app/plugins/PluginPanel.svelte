<script lang="ts">
    import { pluginContributions, pluginPanels } from "./contributions";
    let { id }: { id: string } = $props();
    let entry = $derived(pluginPanels($pluginContributions).find(view => view.id === id));
    let View = $derived(entry?.component);
</script>

{#if View && entry}
    <svelte:boundary>
        <View api={entry.api} />
        {#snippet failed(_error, reset)}
            <p role="alert">This plugin view could not be displayed.</p>
            <button type="button" onclick={reset}>Try again</button>
        {/snippet}
    </svelte:boundary>
{:else}
    <p role="status">This plugin view is unavailable. Enable its bundled plugin in Settings.</p>
{/if}
