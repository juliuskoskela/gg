<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        className?: string;
        label?: string | undefined;
        children?: Snippet;
    }

    let { className = "", label = undefined, children }: Props = $props();
</script>

<div class="panel-header {className}" aria-label={label}>{@render children?.()}</div>

<style>
    .panel-header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--panel-gap) var(--tool-group-gap); flex-shrink: 0; min-width: 0; min-height: var(--panel-toolbar-height); padding: var(--panel-bar-padding) var(--panel-inset); background: var(--panel-header-bg); }
    .panel-header :global(h2), .panel-header :global(h3) { color: var(--text); }
</style>
