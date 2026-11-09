<script lang="ts">
    import type { Snippet } from "svelte";
    import { onMount } from "svelte";
    import { hasModal } from "../stores";
    interface Props {
        children?: Snippet;
    }

    let { children }: Props = $props();

    onMount(() => {
        $hasModal = true;
        return () => {
            $hasModal = false;
        };
    });
</script>

<div id="overlay">
    <!-- the overlay covers the window's drag handles, so it needs its own -->
    <div class="titlebar" data-tauri-drag-region></div>
    {@render children?.()}
</div>

<style>
    #overlay {
        z-index: 100;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;

        background: var(--scrim);
        pointer-events: auto;

        display: grid;
        grid-template-columns: minmax(16px, 1fr) auto minmax(16px, 1fr);
        grid-template-rows: 1fr auto 2fr;
    }

    .titlebar {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        height: var(--titlebar-height, 0px);
        pointer-events: auto;
    }
</style>
