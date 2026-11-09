<script lang="ts">
    import { fade } from "svelte/transition";
    import { dockAnnouncement, panelDragging } from "./panelDrag";
    import { panelLabelFor } from "./panels";
    import { pluginContributions } from "../plugins/contributions";
    import { onMount } from "svelte";
    let reduced = $state(false);
    let innerWidth = $state(0);
    let innerHeight = $state(0);
    onMount(() => {
        let media = matchMedia("(prefers-reduced-motion: reduce)");
        function sync() { reduced = media.matches; }
        sync(); media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    });
    let landing = $derived($panelDragging?.landing);
</script>

<svelte:window bind:innerWidth bind:innerHeight />
<div class="drag-instructions" role="status">{#if $panelDragging}Moving {panelLabelFor($panelDragging.id, $pluginContributions)}. {#if landing}{landing.edge.startsWith("tab") ? "Group with" : `Split ${landing.edge} of`} {panelLabelFor(landing.target, $pluginContributions)}. {/if}Escape to cancel.{:else}{$dockAnnouncement}{/if}</div>
{#if $panelDragging}
    <div class="dock-drag-ghost" style:left="{Math.max(0, Math.min($panelDragging.x + 16, innerWidth - 180))}px" style:top="{Math.min($panelDragging.y + 18, innerHeight - 40)}px" aria-hidden="true">{panelLabelFor($panelDragging.id, $pluginContributions)}</div>
    {#if landing}
        <div class="dock-drop-preview" data-edge={landing.edge} data-target={landing.target}
            style:left="{landing.x}px" style:top="{landing.y}px" style:width="{landing.width}px" style:height="{landing.height}px"
            transition:fade={{ duration: reduced ? 0 : 100 }} aria-hidden="true">
            <span>{landing.edge.startsWith("tab") ? "Group with" : `Split ${landing.edge} of`} {panelLabelFor(landing.target, $pluginContributions)}</span>
        </div>
    {/if}
{/if}

<style>
    .dock-drag-ghost { position: fixed; z-index: 10002; max-width: 176px; padding: 6px 12px; border: 1px solid var(--rule); border-radius: var(--radius-control); background: var(--surface); color: var(--text-strong); box-shadow: var(--shadow-float); font-size: var(--type-ui); pointer-events: none; white-space: nowrap; }
    .dock-drop-preview { position: fixed; z-index: 10000; display: grid; place-items: center; box-sizing: border-box; border: 1px solid var(--accent); border-radius: var(--radius-control); background: color-mix(in srgb, var(--accent) 13%, transparent); pointer-events: none; transition: left 120ms ease-out, top 120ms ease-out, width 120ms ease-out, height 120ms ease-out; }
    .dock-drop-preview span { padding: 5px 10px; border: 1px solid var(--rule); border-radius: var(--radius-control); background: var(--surface); color: var(--text); font-size: var(--type-caption); pointer-events: none; }
    .drag-instructions { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; }
    @media (prefers-reduced-motion: reduce) { .dock-drop-preview { transition: none; } }
</style>
