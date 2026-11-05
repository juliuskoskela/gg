<script lang="ts">
    import { onMount, tick } from "svelte";
    import DisplayZoom from "./display/DisplayZoom.svelte";
    import { compactWorkspace, paneMode, revisionSelectEvent, mobileFilesVisible, hasModal, hasMenu, repoConfigEvent } from "./stores";
    import { workspaceController } from "./workspace/state";
    import InspectorSheet from "./workspace/InspectorSheet.svelte";
    import WorkspaceTools from "./workspace/WorkspaceTools.svelte";
    import { repositoryScope } from "./workspace/repository";
    import SelectionRecovery from "./revision/SelectionRecovery.svelte";
    import Icon from "./controls/Icon.svelte";
    import RevisionActions from "./RevisionActions.svelte";
    import { parseRoute } from "./route.js";
    import Shell from "./Shell.svelte";
    import LogPane from "./LogPane.svelte";
    import RevisionPane from "./RevisionPane.svelte";
    import BoundQuery from "./controls/BoundQuery.svelte";
    import Pane from "./shell/Pane.svelte";
    import RevisionHeading from "./revision/RevisionHeading.svelte";
    import WorkspacePanelControls from "./shell/WorkspacePanelControls.svelte";

    let route = parseRoute();
    $: leftFraction = $workspaceController.graphFraction;
    let workspaceWidth = 1440;
    let containerWidth = 1440;
    let workspaceHeight = 900;
    let viewportHeight = 900;
    $: reservedGraphInset = compact && $workspaceController.presentation !== "closed" ? Math.min(viewportHeight * .52, workspaceHeight * .85) : 0;
    $: visibleGraphInset = $workspaceController.presentation === "collapsed" ? Math.min(72, reservedGraphInset) : reservedGraphInset;
    let isDragging = false;
    let previousPresentation = "closed";
    let wasCompact = false;
    let fullHeading: HTMLHeadingElement;
    let returnFocus: HTMLElement | null = null;
    let mounted = false;
    onMount(() => {
        let cleanup = workspaceController.start();
        mounted = true;
        workspaceController.adaptViewport(route.type === "default" ? compact : true);
        return cleanup;
    });
    $: compact = containerWidth < 880;
    $: compactWorkspace.set(compact);
    $: if (mounted && route.type === "default") workspaceController.adaptViewport(compact);
    $: if (compact !== wasCompact) {
        let editor = document.activeElement?.closest(".detail-region textarea");
        wasCompact = compact;
        if (compact && editor && $revisionSelectEvent) {
            workspaceController.selectRevision($revisionSelectEvent);
            workspaceController.setPresentation("full");
        }
    }
    $: full = $workspaceController.presentation === "full";
    $: if ($repoConfigEvent.type === "Workspace") workspaceController.setRepository(repositoryScope($repoConfigEvent));
    $: if ($workspaceController.inspector && !$workspaceController.inspector.selection) {
        let revset = $workspaceController.inspector.revset;
        let id = { change: { type: "ChangeId" as const, hex: revset, prefix: revset, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "", prefix: "", rest: "" } };
        let fromExpression = $workspaceController.inspector.fromRevset;
        let from = fromExpression ? { ...id, change: { ...id.change, hex: fromExpression, prefix: fromExpression } } : id;
        if ($revisionSelectEvent?.to.change.hex !== revset || (fromExpression && $revisionSelectEvent?.from.change.hex !== fromExpression)) revisionSelectEvent.set({ from, to: id });
    }
    $: if ($workspaceController.presentation !== previousPresentation) {
        let wasFull = previousPresentation === "full";
        previousPresentation = $workspaceController.presentation;
        if (full) { returnFocus = document.activeElement as HTMLElement; tick().then(() => { if (!returnFocus?.matches("textarea")) fullHeading?.focus({ preventScroll: true }); }); }
        else if (wasFull) tick().then(() => {
            let target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : document.querySelector<HTMLElement>('.graph-body button[aria-selected="true"]');
            target?.focus({ preventScroll: true });
        });
    }
    function openStandaloneInspection() {
        if (!$revisionSelectEvent) return;
        let from = $revisionSelectEvent.from.commit.hex || $revisionSelectEvent.from.change.hex;
        let to = $revisionSelectEvent.to.commit.hex || $revisionSelectEvent.to.change.hex;
        let params = new URLSearchParams({ inspect: to });
        if (from !== to) params.set("inspectFrom", from);
        window.location.assign(`/?${params}`);
    }
    function openFull(path?: string) {
        if (path) workspaceController.setFile(path);
        workspaceController.setPresentation("full");
    }
    function escape(event: KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented || $hasModal || $hasMenu || $mobileFilesVisible || document.querySelector("dialog[open], .action-menu")) return;
        let target = event.target as HTMLElement;
        if (target.closest('textarea, input, [role="dialog"], .action-menu, .command-palette')) return;
        if ($workspaceController.routedTool) { event.preventDefault(); workspaceController.closeView(true); }
        else if (full) { event.preventDefault(); workspaceController.back(); }
        else if (compact && $workspaceController.presentation === "half") { event.preventDefault(); workspaceController.setPresentation("collapsed"); }
    }
    // include the splitter when reserving 480px for revision content.
    $: maximumGraphWidth = Math.max(240, workspaceWidth - 484);
    $: graphWidth = Math.max(240, Math.min(maximumGraphWidth, workspaceWidth * leftFraction));

    function resize(width: number) {
        workspaceController.setGraphFraction(Math.max(240, Math.min(maximumGraphWidth, width)) / workspaceWidth);
    }

    function onPointerMove(event: PointerEvent) {
        if (!isDragging) return;
        let container = (event.currentTarget as HTMLElement).parentElement!;
        let rect = container.getBoundingClientRect();
        resize(getComputedStyle(container).direction === "rtl" ? rect.right - event.clientX : event.clientX - rect.left);
    }

    function onKeyDown(event: KeyboardEvent) {
        let direction = getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl" ? -1 : 1;
        if (event.key === "ArrowLeft") resize(graphWidth - 24 * direction);
        else if (event.key === "ArrowRight") resize(graphWidth + 24 * direction);
        else if (event.key === "Home") resize(240);
        else if (event.key === "End") resize(maximumGraphWidth);
        else return;
        event.preventDefault();
    }
</script>

<DisplayZoom />

<svelte:window on:keydown={escape} bind:innerHeight={viewportHeight} />

<Shell revsetOverride={route.type === "revision" ? route.revset : route.type === "default" ? route.inspection?.revset ?? null : null} revsetFromOverride={route.type === "default" ? route.inspection?.fromRevset ?? null : null} let:workspace let:selection>
    {#if route.type !== "default"}
        <WorkspaceTools compact onHistory={() => window.location.assign("/")} onInspect={openStandaloneInspection} />
    {/if}
    {#if route.type === "log"}
        <!-- key on the whole config, not its path - reopening the same repo must remount -->
        <div class="standalone-content" inert={!!$workspaceController.routedTool} aria-hidden={$workspaceController.routedTool ? true : undefined}>
        {#key workspace}
            <LogPane query_choices={workspace.query_choices} latest_query={route.revset ?? workspace.latest_query} />
        {/key}
        </div>
    {:else if route.type === "revision"}
        <div class="standalone-content" inert={!!$workspaceController.routedTool} aria-hidden={$workspaceController.routedTool ? true : undefined}>
        <BoundQuery query={selection} let:data>
            {#if data.type == "Detail"}
                <RevisionPane revs={data} />
            {:else}
                <Pane>
                    <h2 slot="header">No revisions match</h2>
                    <p slot="body">
                        This revset matches nothing.
                    </p>
                </Pane>
            {/if}
            <Pane slot="error" let:message>
                <h2 slot="header">Error</h2>
                <p slot="body">{message}</p>
            </Pane>
            <Pane slot="wait">
                <h2 slot="header">Loading…</h2>
            </Pane>
        </BoundQuery>
        </div>
    {:else}
        <div class="workspace-view" class:compact-workspace={compact} class:full-view={full}>
        {#if !compact && !full}<WorkspacePanelControls revisionAvailable={selection.type === "data" && selection.value.type === "Detail"}>
            <BoundQuery query={selection} let:data>
                {#if data.type === "Detail"}<RevisionHeading revs={data} />{:else}<h2>Revision not found</h2>{/if}
                <h2 slot="wait">Loading revision…</h2>
                <h2 slot="error">Couldn’t load revision</h2>
            </BoundQuery>
        </WorkspacePanelControls>{/if}
        <div class="workspace-body" class:with-tool={!compact && !!$workspaceController.activeTool} bind:clientWidth={containerWidth}>
        <div class="two-pane" inert={compact && !!$workspaceController.routedTool} aria-hidden={compact && $workspaceController.routedTool ? true : undefined} bind:clientWidth={workspaceWidth} bind:clientHeight={workspaceHeight} class:compact class:show-detail={full} class:history-only={$paneMode === "history"} class:change-only={$paneMode === "change"} style="--graph-width: {graphWidth}px;">
            <div id="timeline-panel" class="log-region" inert={full}>
                <!-- key on the whole config, not its path - reopening the same repo must remount -->
                {#key workspace}
                    <LogPane integrated reservedInset={reservedGraphInset} overlayInset={visibleGraphInset} query_choices={workspace.query_choices} latest_query={workspace.latest_query} />
                {/key}
            </div>

            <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (a focusable separator is a widget, per the aria window splitter pattern) -->
            <button
                type="button"
                class="separator"
                role="separator"
                aria-label="Resize revision graph"
                aria-orientation="vertical"
                aria-valuenow={Math.round(graphWidth)}
                aria-valuemin={240}
                aria-valuemax={maximumGraphWidth}
                on:pointerdown={event => { event.preventDefault(); isDragging = true; event.currentTarget.setPointerCapture(event.pointerId); }}
                on:pointermove={onPointerMove}
                on:pointerup={() => isDragging = false}
                on:lostpointercapture={() => isDragging = false}
                on:keydown={onKeyDown}
                class:dragging={isDragging}>
            </button>

            <div id="change-panel" class="detail-region" class:full-inspection={full}>
            {#if full}<header class="full-header"><button type="button" aria-label="Back to graph" on:click={() => { if ($mobileFilesVisible) mobileFilesVisible.set(false); else workspaceController.back(); }}><Icon name="arrow-left" /></button><h1 bind:this={fullHeading} tabindex="-1">Revision</h1>{#if selection.type === "data" && selection.value.type === "Detail"}<span class="full-identity">{selection.value.headers[0].id.change.hex.slice(0, 8)}</span><button type="button" aria-label="Commands" title="Commands (Ctrl/⌘ K)" on:click={() => window.dispatchEvent(new Event("gg:open-commands"))}><Icon name="command" /></button><RevisionActions headers={selection.value.headers} hasChanges={selection.value.changes.length > 0} compact />{/if}</header>{/if}
            <BoundQuery query={selection} let:data>
                {#if data.type == "Detail"}
                    <RevisionPane integrated focused={full} revs={data} requestedPath={$workspaceController.inspector?.activeFilePath ?? null} onFileSelected={path => workspaceController.setFile(path)} />
                {:else}
                    <Pane titlebar>
                        <div slot="header" class="query-header"><h2>Revision not found</h2></div>
                        <div slot="body"><SelectionRecovery /><p>This revset matches nothing.</p></div>
                    </Pane>
                {/if}
                <Pane titlebar slot="error" let:message>
                    <div slot="header" class="query-header"><h2>Couldn’t load revision</h2></div>
                    <div slot="body"><SelectionRecovery /><p>{message}</p></div>
                </Pane>
                <Pane titlebar slot="wait">
                    <div slot="header" class="query-header"><h2>Loading revision…</h2></div>
                </Pane>
            </BoundQuery></div>
            {#if compact && !full}<InspectorSheet {selection} presentation={$workspaceController.presentation} onPresentation={value => workspaceController.setPresentation(value)} onFull={openFull} />{/if}
        </div>
        <WorkspaceTools {compact} overFull={full} onHistory={() => { if ($workspaceController.routedTool) workspaceController.closeView(true); else workspaceController.setPresentation("closed"); paneMode.set("both"); }} onInspect={() => { if ($workspaceController.routedTool) workspaceController.closeView(true); else { if (!$workspaceController.inspector && $revisionSelectEvent) workspaceController.selectRevision($revisionSelectEvent); workspaceController.setPresentation("full"); } }} />
        </div>
        </div>
    {/if}
</Shell>

<style>
    .workspace-view { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; min-width: 0; overflow: hidden; }
    .standalone-content { display: grid; min-width: 0; min-height: 0; overflow: hidden; }
    .workspace-body { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-height: 0; overflow: hidden; }
    .workspace-body.with-tool { grid-template-columns: minmax(0, 1fr) minmax(280px, 320px); }
    .query-header { display: flex; align-items: center; gap: 8px; }
    .query-header h2 { font-size: 13px; font-weight: 500; }
    .two-pane {
        position: relative;
        display: grid;
        grid-template-columns: var(--graph-width) 4px minmax(0, 1fr);
        min-height: 0;
        min-width: 0;
        height: 100%;
        overflow: hidden;
    }

    .log-region, .detail-region { display: grid; min-width: 0; min-height: 0; overflow: hidden; }
    .two-pane.history-only, .two-pane.change-only { grid-template-columns: minmax(0, 1fr); }
    .history-only .detail-region, .change-only .log-region, .history-only .separator, .change-only .separator { display: none; }
    .log-region { container: timeline / inline-size; }
    .detail-region { container: revision / inline-size; }

    .separator {
        position: relative;
        background: transparent;
        cursor: col-resize;
        touch-action: none;
        user-select: none;
        width: 4px;
        margin: 0;
        border: none;
        padding: 0;
    }

    .separator::before { content: ""; position: absolute; inset-block: 0; inset-inline: -5px; }
    @media (pointer: coarse) { .separator::before { inset-inline: -10px; } }
    .separator::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: 1px; width: 1px; background: var(--rule); pointer-events: none; }
    @media (hover: hover) { .separator:hover { background: var(--hover); } .separator:hover::after { background: var(--control-hover); } }

    .separator:focus-visible {
        outline: none;
    }

    .separator.dragging,
    .separator:focus-visible {
        background: var(--accent-subtle);
    }
    .separator.dragging::after, .separator:focus-visible::after {
        background: var(--accent);
    }
    .compact { grid-template-columns: minmax(0, 1fr); }
    .compact .separator, .compact .detail-region { display: none; }
    .compact .log-region, .compact.change-only .log-region { display: grid; }
    .compact.show-detail .log-region { display: grid; visibility: hidden; }
    .compact.show-detail .detail-region { display: flex; }
    .compact-workspace, .full-view { grid-template-rows: minmax(0, 1fr); }
    .full-inspection { position: fixed; inset: 0; z-index: 40; display: flex !important; flex-direction: column; background: var(--surface); padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom); }
    .with-tool .full-inspection { inset-inline-end: min(320px, 40vw); }
    .full-inspection :global(.revision-pane) { flex: 1; }
    .full-header { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 4px 12px; border-block-end: 1px solid var(--rule); background: var(--ground); flex-shrink: 0; }
    .full-header h1 { font-size: var(--type-ui); font-weight: 500; }
    .full-header > button { min-height: 44px; min-width: 44px; border: 0; color: var(--text); background: transparent; display: grid; place-items: center; cursor: pointer; }
    .full-identity { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: var(--type-caption); font-family: var(--stack-code); }
    .full-header :global(.revision-actions) { width: auto; }
    .full-header :global(.action-menu) { inset-block-start: calc(100% + 4px); inset-block-end: auto; }
    .full-view .log-region { visibility: hidden; }
    .full-view .separator { visibility: hidden; }
</style>
