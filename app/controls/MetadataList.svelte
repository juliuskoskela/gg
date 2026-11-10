<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        label?: string;
        children?: Snippet;
    }

    let { label = "Revision metadata", children }: Props = $props();
</script>

<!-- one grid for the whole list: keys share a column sized to the longest key, and keys and values share baselines -->
<div class="metadata-frame"><dl class="metadata-list" aria-label={label}>{@render children?.()}</dl></div>

<style>
    /* a query can't style its own container, so the frame is the container and the list responds to it */
    .metadata-frame { container: metadata / inline-size; min-width: 0; }
    .metadata-list {
        display: grid; grid-template-columns: minmax(3.5rem, max-content) minmax(0, 1fr); align-items: baseline;
        gap: var(--gap-row) 16px; margin: 0; min-width: 0;
    }
    @container metadata (max-width: 300px) { .metadata-list { grid-template-columns: minmax(0, 1fr); row-gap: 0; } }
</style>
