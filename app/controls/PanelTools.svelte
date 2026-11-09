<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        label: string;
        summaryVisible?: boolean;
        summary?: Snippet;
        children?: Snippet;
    }

    let {
        label,
        summaryVisible = true,
        summary,
        children
    }: Props = $props();
</script>

<div class="panel-tools" role="group" aria-label={label}>
    {#if summaryVisible && summary}<div class="panel-tools-summary">{@render summary?.()}</div>{/if}
    <div class="panel-tools-controls">{@render children?.()}</div>
</div>

<style>
    .panel-tools { display: flex; align-items: center; justify-content: var(--panel-tools-justify, flex-end); flex-wrap: var(--panel-tools-wrap, wrap); gap: var(--panel-gap) var(--tool-group-gap); min-width: 0; width: 100%; pointer-events: auto; }
    .panel-tools-summary { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; margin-inline-end: auto; }
    .panel-tools-controls { display: flex; align-items: center; justify-content: var(--panel-tools-justify, flex-end); gap: var(--tool-group-gap); min-width: 0; max-width: 100%; margin-inline-start: var(--panel-tools-margin, auto); }
</style>
