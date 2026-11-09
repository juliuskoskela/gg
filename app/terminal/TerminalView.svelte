<svelte:options runes={true} />

<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import { closeTerminal, terminalSession } from "./session";

    let { directory, active = true }: { directory: string; active?: boolean } = $props();
    let host: HTMLDivElement;
    // the parent keys this component by workspace directory.
    let session = $state(terminalSession(untrack(() => directory)));
    let status = $derived(session.state);
    let directoryName = $derived(directory.split(/[\\/]/).filter(Boolean).at(-1) || directory);
    let mounted = false;

    async function restart() {
        closeTerminal(directory);
        session = terminalSession(directory);
        await session.mount(host);
        session.focus();
    }

    $effect(() => {
        if (active) tick().then(() => { session.resize(); if (mounted) session.focus(); });
    });

    onMount(() => {
        let observer = new ResizeObserver(() => session.resize());
        observer.observe(host);
        let themeObserver = new MutationObserver(() => session.appearance());
        let shell = document.getElementById("shell");
        if (shell) themeObserver.observe(shell, { attributes: true, attributeFilter: ["style", "class", "data-theme", "data-theme-family", "data-dark-depth", "data-color-vision"] });
        void session.mount(host).then(() => { mounted = true; if (active) session.focus(); });
        return () => { mounted = false; observer.disconnect(); themeObserver.disconnect(); };
    });
</script>

<ViewToolbar label="Terminal tools">
    <span class="toolbar-lead terminal-directory" title={directory}>{directoryName}</span>
    <span id="terminal-restart" tabindex="-1">
        <ActionWidget safe onClick={restart} tip={$status.phase === "running" ? "End the current shell and start a new one" : "Start a new shell"}>{$status.phase === "running" ? "Restart shell" : "New shell"}</ActionWidget>
    </span>
</ViewToolbar>
<div class="terminal-view">
    {#if $status.message}<p class="terminal-status" role={$status.phase === "error" ? "alert" : "status"}>{$status.message}</p>{/if}
    <div class="terminal-host" bind:this={host}></div>
    <pre class="screen-reader-only" aria-label="Terminal screen">{$status.screen}</pre>
</div>

<style>
    .terminal-directory { max-width: min(60ch, calc(100% - 8rem)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--font-label); }
    .terminal-view { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
    .terminal-host { flex: 1; min-width: 0; min-height: 0; overflow: hidden; padding: var(--space-2); font: var(--font-id); pointer-events: auto; }
    .terminal-host :global(.terminal-renderer), .terminal-host :global(.terminal-renderer *) { pointer-events: auto; }
    .terminal-host:focus-within { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .terminal-status { margin: 0; padding: var(--space-2) var(--space-3); color: var(--muted); font: var(--font-label); }
    .screen-reader-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: pre; }
</style>
