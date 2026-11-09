<script lang="ts">
    import type { Snippet } from "svelte";
    import PanelFooter from "../controls/PanelFooter.svelte";
    import { hasModal } from "../stores";

    interface Props {
        element?: HTMLDivElement;
        showHeader?: boolean;
        showSummary?: boolean;
        header?: Snippet;
        summary?: Snippet;
        children?: Snippet;
        footer?: Snippet;
    }

    let {
        element = $bindable(undefined),
        showHeader = true,
        showSummary = true,
        header,
        summary,
        children,
        footer
    }: Props = $props();
</script>

<section class="timeline-panel" inert={$hasModal}>
    {#if showHeader && header}
        <header class="timeline-header">{@render header?.()}</header>
    {/if}
    <div class="timeline-section graph-body" class:unsummarised={!showSummary} bind:this={element}>
        {#if showSummary}<div class="timeline-summary">{@render summary?.()}</div>{/if}
        <div class="timeline-viewport">{@render children?.()}</div>
        <PanelFooter className="timeline-footer">{@render footer?.()}</PanelFooter>
    </div>
</section>

<style>
    .timeline-panel {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .timeline-header {
        display: flex;
        align-items: center;
        flex: none;
        min-height: var(--panel-toolbar-height);
        padding: 4px var(--pane-inset);
        background: var(--panel-header-bg);
        border-bottom: 1px solid var(--rule);
    }

    .timeline-section {
        display: grid;
        flex: 1;
        grid-template-rows: auto minmax(0, 1fr) auto;
        min-width: 0;
        min-height: 0;
    }

    .timeline-section.unsummarised { grid-template-rows: minmax(0, 1fr) auto; }

    .timeline-summary {
        display: grid;
        align-items: center;
        min-width: 0;
        min-height: 32px;
        padding-inline: var(--pane-inset);
    }

    .timeline-viewport {
        display: grid;
        min-width: 0;
        min-height: 0;
        /* inset the viewport, not its rows: scrolling and svg coordinates retain the same origin. */
        padding-inline: var(--pane-inset);
    }

    @media (pointer: coarse) {
        .timeline-section.unsummarised { grid-template-rows: minmax(0, 1fr) auto; }

    .timeline-summary { min-height: 44px; }
    }
</style>
