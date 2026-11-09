<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        label?: string;
        children?: Snippet;
    }

    let { label = "Revision metadata", children }: Props = $props();
</script>

<!-- one grid for the whole list: keys share a column sized to the longest key, and keys and values share baselines -->
<dl class="metadata-list" aria-label={label}>{@render children?.()}</dl>

<style>
    .metadata-list {
        container: metadata / inline-size;
        display: grid; grid-template-columns: minmax(3.5rem, max-content) minmax(0, 1fr); align-items: baseline;
        gap: var(--gap-row) 16px; margin: 0; min-width: 0;
    }
    @container metadata (max-width: 300px) { .metadata-list { grid-template-columns: minmax(0, 1fr); row-gap: 0; } }
</style>
