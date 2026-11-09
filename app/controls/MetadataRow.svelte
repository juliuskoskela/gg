<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        label: string;
        children?: Snippet;
    }

    let { label, children }: Props = $props();
</script>

<div class="metadata-row"><dt>{label}</dt><dd>{@render children?.()}</dd></div>

<style>
    /* rows lay out in their list's grid */
    .metadata-row { display: contents; }
    dt { margin: 0; color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    dd { margin: 0; min-width: 0; color: var(--text); font: var(--font-body); overflow-wrap: anywhere; }
    @container metadata (max-width: 300px) { dd { margin-block-end: var(--gap-group); } }
</style>
