<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        label?: string | undefined;
        children: Snippet;
    }

    let { label = undefined, children }: Props = $props();
</script>

<!-- a pane opens on a bar of the same height and shade as the view's bars, closed by the inner rule -->
<div class="pane-bar" role={label ? "group" : undefined} aria-label={label}>{@render children()}</div>

<style>
    .pane-bar { display: flex; flex: none; align-items: center; gap: var(--panel-gap); min-width: 0; min-height: var(--panel-toolbar-height); box-sizing: border-box; padding-inline: var(--view-bar-inset); background: var(--panel-header-bg); border-block-end: 1px solid var(--view-inner-rule); pointer-events: auto; --control-height: var(--panel-control-size); --control-padding-block: var(--control-padding-compact); --input-surface: var(--panel-header-bg); }
    .pane-bar > :global(.bar-field) { flex: 1; min-width: 0; }
    .pane-bar :global(.bar-field .tree-search), .pane-bar :global(.bar-field .file-search) { width: 100%; }
    @media (pointer: coarse), (max-width: 600px) { .pane-bar :global(.bar-field .tree-search), .pane-bar :global(.bar-field .file-search) { min-height: 44px; } }
</style>
