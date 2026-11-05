<script lang="ts">
    import { hasModal } from "../stores";

    // the header shares space with the macos titlebar
    export let titlebar = false;
    export let headerHeight = 40;
    export let flexibleHeader = false;
</script>

<section inert={$hasModal} class:titlebar style="--pane-header-height: {flexibleHeader ? "auto" : `${headerHeight}px`}">
    <div class="header">
        {#if titlebar}
            <div class="drag-region" data-tauri-drag-region></div>
        {/if}
        <slot name="header" />
    </div>
    <div class="body">
        <slot name="body" />
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
        border-bottom: 1px solid var(--rule);
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
