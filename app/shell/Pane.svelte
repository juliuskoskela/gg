<script lang="ts">
    import type { Snippet } from "svelte";
    import { hasModal } from "../stores";


    interface Props {
        // the header shares space with the macos titlebar
        titlebar?: boolean;
        headerHeight?: number;
        flexibleHeader?: boolean;
        header?: Snippet;
        body?: Snippet;
    }

    let {
        titlebar = false,
        headerHeight = 40,
        flexibleHeader = false,
        header,
        body
    }: Props = $props();
</script>

<section inert={$hasModal} class:titlebar style="--pane-header-height: {flexibleHeader ? "auto" : `${headerHeight}px`}">
    <div class="header">
        {#if titlebar}
            <div class="drag-region" data-tauri-drag-region></div>
        {/if}
        {@render header?.()}
    </div>
    <div class="body">
        {@render body?.()}
    </div>
</section>

<style>
    section {
        display: grid;
        grid-template-rows: var(--pane-header-height) minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        grid-template-columns: 100%;
        overflow: hidden;
    }

    .header {
        min-height: var(--panel-toolbar-height);
        background: var(--panel-header-bg);
        border-block-end: 1px solid var(--view-inner-rule);
        padding: 4px var(--pane-inset);
        min-width: 0;
    }

    .body {
        padding: 0;
        min-height: 0;
        min-width: 0;
        display: grid;
        overflow: hidden;
    }

    .drag-region {
        display: none;
    }

    @media (max-width: 900px) {
        .header { padding: 4px var(--pane-inset); }
        .body { padding: 0; }
    }
</style>
