<script lang="ts">
    import { onMount, tick } from "svelte";
    import { restoreViewState, saveViewState, workspaceViews } from "./views";
    import { workspaceController } from "./state";
    import { repoStatusEvent, selectionHeaders } from "../stores";
    import Icon from "../controls/Icon.svelte";
    export let compact = false;
    export let overFull = false;
    export let onHistory: () => void;
    export let onInspect: () => void;
    let previousFocus: HTMLElement | null = null;
    let destinationHeading: HTMLHeadingElement;
    let previousRoute: string | null = null;
    $: if ($workspaceController.routedTool !== previousRoute) {
        let hadRoute = previousRoute !== null;
        previousRoute = $workspaceController.routedTool;
        if (previousRoute) tick().then(() => destinationHeading?.focus({ preventScroll: true }));
        else if (hadRoute) tick().then(() => {
            let target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : document.querySelector<HTMLElement>('.full-header h1, .graph-body button[aria-selected="true"]');
            target?.focus({ preventScroll: true });
        });
    }
    let lastView = "";
    let viewState: unknown;
    $: if (active && active.id !== lastView) { lastView = active.id; viewState = restoreViewState(active); }
    $: if (!active) lastView = "";
    function setViewState(value: unknown) { if (active) { viewState = value; saveViewState(active, value); } }
    $: context = { status: $repoStatusEvent, hasSelection: $selectionHeaders.length > 0 };
    $: activeId = compact ? $workspaceController.routedTool : $workspaceController.activeTool;
    $: active = workspaceViews.find(view => view.id === activeId && view.component);
    $: available = active && (!active.available || active.available(context));
    $: tabs = $workspaceController.toolTabs.map(id => workspaceViews.find(view => view.id === id)).filter(view => !!view);
    onMount(() => {
        function open(event: Event) {
            let id = (event as CustomEvent<string>).detail;
            let view = workspaceViews.find(candidate => candidate.id === id);
            if (!view || (view.available && !view.available(context))) return;
            if (view.destination) { ({ history: onHistory, inspect: onInspect })[view.destination](); return; }
            if (!view.component) return;
            if (compact && !$workspaceController.routedTool) previousFocus = document.activeElement as HTMLElement;
            workspaceController.openView(id, compact);
        }
        window.addEventListener("gg:open-view", open);
        return () => window.removeEventListener("gg:open-view", open);
    });
    function close() {
        workspaceController.closeView(compact);
    }
</script>

{#if active}
    <section class="tool-host" class:destination={compact} class:over-full={overFull && !compact} aria-label="Repository tools">
        {#if compact}
            <header class="tool-header"><button type="button" aria-label="Back from repository tool" on:click={close}><Icon name="arrow-left" /></button><h1 tabindex="-1" bind:this={destinationHeading}>{active.label}</h1></header>
        {:else}
            <header class="tool-header"><nav class="tool-tabs" aria-label="Open repository tools">{#each tabs as view (view.id)}<button type="button" aria-current={view.id === active.id ? "page" : undefined} on:click={() => workspaceController.openView(view.id, false)}>{view.label}</button>{/each}</nav><button type="button" aria-label="Close active tool" on:click={() => $workspaceController.routedTool ? workspaceController.closeView(true) : workspaceController.closeTab(active.id)}><Icon name="x" /></button></header>
        {/if}
        <div class="tool-content">
            {#if available && active.component}<svelte:component this={active.component} {...context} {viewState} onViewStateChange={setViewState} />{:else}<p role="status">{active.label} is unavailable in this repository.</p>{/if}
        </div>
        {#if !compact}<footer><button type="button" on:click={close}>Hide tools</button><button type="button" on:click={() => workspaceController.resetLayout()}>Reset tool layout</button></footer>{/if}
    </section>
{:else if !compact && tabs.length}
    <button class="restore-tools" type="button" on:click={() => workspaceController.openView(tabs[tabs.length - 1].id, false)}>Restore tools</button>
{/if}

<style>
    .restore-tools { position: absolute; inset-block-start: 4px; inset-inline-end: 8px; z-index: 3; background: var(--surface); border: 1px solid var(--border); }
    .tool-host { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; border-inline-start: 1px solid var(--rule); background: var(--surface); }
    .tool-host.over-full { position: fixed; inset-block: 0; inset-inline-end: 0; width: min(320px, 40vw); z-index: 50; box-shadow: var(--shadow-overlay); }
    .tool-host.destination { position: fixed; inset: 0; z-index: 60; padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom); }
    .tool-header { display: flex; align-items: center; gap: 8px; min-height: 40px; border-block-end: 1px solid var(--rule); background: var(--ground); }
    .destination .tool-header { min-height: 52px; }
    .tool-header h1 { font-size: var(--type-ui); }
    .tool-tabs { padding: 3px var(--panel-inset); gap: 2px; display: flex; flex: 1; min-width: 0; overflow-x: auto; }
    button { flex-shrink: 0; min-height: 40px; padding: 6px 10px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
    .tool-tabs button { min-height: 24px; padding: 2px 8px; }
    button[aria-current] { color: var(--text-strong); background: var(--surface); border-radius: var(--radius-control); }
    .tool-header > button { min-width: 40px; display: grid; place-items: center; }
    .destination .tool-header > button { min-width: 44px; min-height: 44px; }
    .tool-content { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
    footer { display: flex; justify-content: flex-end; border-block-start: 1px solid var(--rule); }
    @media (hover: hover) { button:hover { background: var(--hover); color: var(--text); } }
</style>
