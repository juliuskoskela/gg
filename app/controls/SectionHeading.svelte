<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        title: string;
        count?: number | string | undefined;
        /** controls that belong to the section, at the trailing edge */
        actions?: Snippet | undefined;
    }

    let { title, count = undefined, actions = undefined }: Props = $props();
</script>

<div class="section-heading" class:has-actions={!!actions}>
    <div class="lead">
        <h3>{title}</h3>
        {#if count !== undefined}<span class="count">{count}</span>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
    .section-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); min-width: 0; margin: 0 0 var(--gap-group); }
    .section-heading.has-actions { min-height: var(--control-height); }
    .lead { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
    h3 { margin: 0; color: var(--text-strong); font: var(--font-heading); overflow-wrap: anywhere; }
    .count { color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; margin-inline-start: auto; }
</style>
