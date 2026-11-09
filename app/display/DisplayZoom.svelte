<script lang="ts">
    import { onMount } from "svelte";
    import { isTauri } from "@tauri-apps/api/core";
    import { appZoom, executeZoomCommand, nativeZoomEnabled, zoomShortcut, zoomStorageKey } from "./zoom";

    onMount(() => {
        let enabled = isTauri();
        nativeZoomEnabled.set(enabled);
        if (!enabled) return;
        void appZoom.restore();
        let disposed = false;
        let unlisten: (() => void) | undefined;
        import("@tauri-apps/api/event").then(({ listen }) => listen<string>("gg://menu/view", event => executeZoomCommand(event.payload)))
            .then(stop => { if (disposed) stop(); else unlisten = stop; })
            .catch(error => console.warn("App zoom menu listener unavailable", error));
        function keyboard(event: KeyboardEvent) {
            let command = zoomShortcut(event);
            if (!command) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void executeZoomCommand(command);
        }
        function storage(event: StorageEvent) {
            if (event.key !== zoomStorageKey && event.key !== null) return;
            void appZoom.restore();
        }
        window.addEventListener("keydown", keyboard, true);
        window.addEventListener("storage", storage);
        return () => {
            disposed = true;
            unlisten?.();
            nativeZoomEnabled.set(false);
            window.removeEventListener("keydown", keyboard, true);
            window.removeEventListener("storage", storage);
        };
    });
</script>

{#if $nativeZoomEnabled}
    <span class="zoom-announcement" role="status">{!$appZoom.pending ? `App zoom ${Math.round($appZoom.level * 100)}%` : ""}</span>
    {#if $appZoom.error}<div class="zoom-error" role="alert"><span>{$appZoom.error}</span><button type="button" onclick={() => appZoom.reset()}>Reset to 100%</button></div>{/if}
{/if}

<style>
    .zoom-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .zoom-error { position: fixed; inset-inline: 16px; inset-block-end: 16px; z-index: 500; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--negative); background: var(--raised); color: var(--text); font-size: var(--type-body); }
    button { min-height: 32px; padding: 4px 8px; color: var(--text); background: var(--surface); border: 1px solid var(--border); }
</style>
