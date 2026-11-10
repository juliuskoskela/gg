<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        className?: string;
        children?: Snippet;
    }

    let { className = "", children }: Props = $props();
</script>

<footer class="panel-footer {className}">{@render children?.()}</footer>

<style>
    .panel-footer {
        display: flex;
        align-items: center;
        flex: none;
        min-width: 0;
        height: 49px;
        min-height: 49px;
        padding: 8px var(--pane-inset);
        background: var(--panel-header-bg);
        border-block-start: 1px solid var(--view-inner-rule);
    }

    .panel-footer > :global(*) {
        flex: 1;
        min-width: 0;
    }

    @media (pointer: coarse), (max-width: 600px) {
        .panel-footer { height: 61px; min-height: 61px; }
    }
</style>
