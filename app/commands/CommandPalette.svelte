<script lang="ts">
    import TextField from "../controls/TextField.svelte";
    import DestinationPicker from "./DestinationPicker.svelte";
    import { mutationPending } from "../operations";
    import { commandOperand, currentWorkspaceIdentity } from "./context";
    import { onMount, tick } from "svelte";
    import { currentContext, currentMutation, hasModal, ignoreToggled, repoConfigEvent, repoStatusEvent, selectionHeaders } from "../stores";
    import { contextCommands, repositoryCommands, revisionCommands, type Command } from "./registry";
    import { workspaceViews } from "../workspace/views";
    import type { RevHeader } from "../messages/RevHeader";
    import { appZoom, nativeZoomEnabled, zoomCommands } from "../display/zoom";

    export let headers: RevHeader[] | undefined = undefined;
    let open = false;
    let search = "";
    let input: HTMLInputElement | undefined;
    let dialog: HTMLDialogElement;
    let previous: HTMLElement | null = null;
    $: activeHeaders = headers ?? $selectionHeaders;
    $: commands = [
        ...zoomCommands($appZoom, $nativeZoomEnabled),
        ...repositoryCommands("", $currentMutation, $mutationPending, $repoStatusEvent, $repoConfigEvent),
        ...workspaceViews.map((view): Command => ({ id: `view.${view.id}`, label: view.commandLabel ?? view.label, icon: "layers", scope: "View", reason: view.available && !view.available({ status: $repoStatusEvent, hasSelection: activeHeaders.length > 0 }) ? "Not available" : null, execute: () => { window.dispatchEvent(new CustomEvent("gg:open-view", { detail: view.id })); } })),
        ...revisionCommands(activeHeaders, true, $currentMutation, $mutationPending, $repoStatusEvent, $ignoreToggled),
        ...contextCommands($commandOperand ?? $currentContext, $currentWorkspaceIdentity, $currentMutation, $mutationPending, $ignoreToggled),
    ];
    $: filtered = commands.filter(c => `${c.label} ${c.scope}`.toLowerCase().includes(search.toLowerCase()));
    async function show() {
        if ($hasModal || open) return;
        previous = document.activeElement as HTMLElement;
        search = ""; open = true;
        await tick(); dialog.showModal(); input?.focus();
    }
    onMount(() => { window.addEventListener("gg:open-commands", show); return () => window.removeEventListener("gg:open-commands", show); });
    function close() { dialog?.close(); open = false; previous?.focus(); }
    function run(command: Command) { if (command.reason) return; close(); command.execute(); }
    function focusResult(index: number) {
        let buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>(".results button"));
        let next = buttons[Math.max(0, Math.min(buttons.length - 1, index))];
        next?.focus(); next?.scrollIntoView({ block: "nearest" });
    }
    function key(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); if (open) close(); else show(); return; }
        if (!open) {
            let target = event.target as HTMLElement | null;
            let editor = target?.matches("input, textarea, select, [contenteditable]:not([contenteditable=false])") || target?.closest("[contenteditable]:not([contenteditable=false])");
            if (!editor && !$hasModal && !$currentMutation && !$mutationPending && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                let command = repositoryCommands().find(c => c.id === (event.shiftKey ? "repository.redo" : "repository.undo"));
                if (command && !command.reason) { event.preventDefault(); command.execute(); }
            }
            return;
        }
        if (event.key === "Escape") { event.preventDefault(); close(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            let buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>(".results button"));
            let current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            focusResult(current < 0 ? 0 : current + (event.key === "ArrowDown" ? 1 : -1));
        }
        if (event.key === "Enter" && event.target === input && filtered[0]) { event.preventDefault(); run(filtered[0]); }
    }
</script>
<svelte:window on:keydown={key} />
{#if open}
    <dialog bind:this={dialog} class="palette" aria-label="Commands" on:cancel|preventDefault={close} on:click={event => { if (event.target === dialog) close(); }}>
        <div class="content">
            <div class="heading"><label for="command-search">Commands</label><button type="button" on:click={close} aria-label="Close commands">×</button></div>
            <TextField id="command-search" bind:element={input} bind:value={search} placeholder="Search commands" autocomplete="off" aria-controls="command-results" />
            <div id="command-results" class="results" aria-label="Available commands">
                {#each filtered as command (command.id)}
                    <button type="button" aria-disabled={!!command.reason} on:click={() => run(command)}>
                        <span>{command.label}<small>{command.scope}{#if command.shortcut} · {command.shortcut}{/if}</small></span>{#if command.reason}<small>{command.reason}</small>{/if}
                    </button>
                {:else}<p>No matching commands</p>{/each}
            </div>
        </div>
    </dialog>
{/if}
<style>
    .palette { position: fixed; inset: min(12vh, 90px) 16px auto; width: min(560px, calc(100% - 32px)); max-width: none; max-height: min(70dvh, 640px); box-sizing: border-box; margin: 0 auto; padding: 0; background: var(--raised); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-surface); box-shadow: var(--shadow-overlay); pointer-events: auto; }
    .palette::backdrop { background: #0008; }
    .content { display: flex; flex-direction: column; max-height: min(70dvh, 640px); padding: 12px; pointer-events: auto; }
    .heading { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
    .heading button { border: 0; background: transparent; color: inherit; font-size: 24px; min-width: 44px; min-height: 44px; }
    .content :global(.text-field) { width: 100%; box-sizing: border-box; min-height: 44px; }
    .results { overflow: auto; margin-top: 8px; pointer-events: auto; }
    .results button { width: 100%; min-height: 44px; padding: 8px; text-align: left; border: 0; border-radius: var(--radius-control); background: transparent; color: inherit; display: flex; justify-content: space-between; gap: 8px; }
    .results button:focus, .results button:hover { background: var(--hover); }
    .results button[aria-disabled="true"] { color: var(--text-disabled); }
    small { display: block; font-size: 12px; color: var(--muted); }
    p { padding: 8px; color: var(--muted); }
</style>

<DestinationPicker />
