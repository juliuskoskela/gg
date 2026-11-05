<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { currentWorkspaceIdentity } from "../commands/context";
    import type { Operand } from "../messages/Operand";
    import { currentMutation, ignoreToggled } from "../stores";
    import { mutationPending } from "../operations";
    import { contextCommands, revisionCommands } from "../commands/registry";
    export let operand: Operand;
    export let x: number;
    export let y: number;
    export let onClose: () => void;
    let menuElement: HTMLDivElement;
    let previous = document.activeElement as HTMLElement | null;
    onMount(() => menuElement?.querySelector<HTMLButtonElement>("button")?.focus());
    onDestroy(() => { if (document.activeElement === document.body || menuElement?.contains(document.activeElement)) previous?.focus({ preventScroll: true }); });
    function key(event: KeyboardEvent) {
        if (event.key === "Escape" || event.key === "Tab") { onClose(); if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); } return; }
        let items = Array.from(menuElement.querySelectorAll<HTMLButtonElement>("button"));
        let index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown") index = (index + 1) % items.length;
        else if (event.key === "ArrowUp") index = (index - 1 + items.length) % items.length;
        else if (event.key === "Home") index = 0;
        else if (event.key === "End") index = items.length - 1;
        else return;
        event.preventDefault(); items[index]?.focus();
    }
    $: commands = operand.type === "Revision" ? revisionCommands([operand.header], false, $ignoreToggled, $currentMutation, $mutationPending) : operand.type === "Revisions" ? revisionCommands(operand.headers, false, $ignoreToggled, $currentMutation, $mutationPending) : contextCommands(operand, $currentWorkspaceIdentity, $ignoreToggled, $currentMutation, $mutationPending);
    $: if (menuElement) {
        let rect = menuElement.getBoundingClientRect();
        menuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
        menuElement.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    }
</script>
<svelte:window on:click={onClose} />
<div class="context-menu" style="left: {x}px; top: {y}px;" role="menu" tabindex="0" on:click|stopPropagation on:keydown={key} bind:this={menuElement}>
    {#each commands as command (command.id)}
        <button role="menuitem" aria-disabled={!!command.reason} title={command.reason ?? command.label} on:click={() => { if (!command.reason) { command.execute(); onClose(); } }}>{command.label}{#if command.reason} — {command.reason}{/if}</button>
    {/each}
</div>

<style>
    .context-menu { position: fixed; z-index: 1000; background: var(--raised); border: 1px solid var(--border); border-radius: var(--radius-control); padding: 5px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 16px); overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; box-shadow: var(--shadow-overlay); }
    button { width: 100%; display: block; border: none; min-height: var(--control-height); padding: 6px var(--control-padding-inline); font-size: 13px; line-height: 20px; border-radius: var(--radius-control); text-align: start; background: transparent; color: var(--text); font-family: var(--stack-ui); }
    button[aria-disabled="true"] { color: var(--text-disabled); }
    button:not([aria-disabled="true"]) { cursor: pointer; }
    @media (hover: hover) { button:not([aria-disabled="true"]):hover { background: var(--hover); } }
    button:not([aria-disabled="true"]):active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
</style>
