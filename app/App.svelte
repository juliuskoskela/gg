<script lang="ts">
    import { onMount, untrack } from "svelte";
    import DisplayZoom from "./display/DisplayZoom.svelte";
    import { compactWorkspace, revisionSelectEvent, hasModal, hasMenu, repoConfigEvent } from "./stores";
    import { workspaceController } from "./workspace/state";
    import WorkspaceTools from "./workspace/WorkspaceTools.svelte";
    import WorkspaceSurface from "./workspace/WorkspaceSurface.svelte";
    import { repositoryScope } from "./workspace/repository";
    import { parseRoute } from "./route.js";
    import Shell from "./Shell.svelte";
    import LogPane from "./LogPane.svelte";
    import RevisionPane from "./RevisionPane.svelte";
    import BoundQuery from "./controls/BoundQuery.svelte";
    import Pane from "./shell/Pane.svelte";

    let route = parseRoute();
    let containerWidth = $state(1440);
    let mounted = $state(false);
    onMount(() => {
        let cleanup = workspaceController.start();
        mounted = true;
        workspaceController.adaptViewport(route.type === "default" ? compact : true);
        return cleanup;
    });
    let compact = $derived(containerWidth < 880);
    $effect.pre(() => { let narrow = compact; untrack(() => compactWorkspace.set(narrow)); });
    $effect.pre(() => {
        let ready = mounted, narrow = compact;
        if (ready && route.type === "default") untrack(() => workspaceController.adaptViewport(narrow));
    });
    $effect.pre(() => {
        let config = $repoConfigEvent;
        if (config.type === "Workspace") untrack(() => workspaceController.setRepository(repositoryScope(config)));
    });
    $effect.pre(() => {
        let inspector = $workspaceController.inspector, selected = $revisionSelectEvent;
        if (!inspector || inspector.selection) return;
        untrack(() => {
            let revset = inspector.revset;
            let id = { change: { type: "ChangeId" as const, hex: revset, prefix: revset, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId" as const, hex: "", prefix: "", rest: "" } };
            let fromExpression = inspector.fromRevset;
            let from = fromExpression ? { ...id, change: { ...id.change, hex: fromExpression, prefix: fromExpression } } : id;
            if (selected?.to.change.hex !== revset || (fromExpression && selected?.from.change.hex !== fromExpression)) revisionSelectEvent.set({ from, to: id });
        });
    });
    function openStandaloneInspection() {
        if (!$revisionSelectEvent) return;
        let from = $revisionSelectEvent.from.commit.hex || $revisionSelectEvent.from.change.hex;
        let to = $revisionSelectEvent.to.commit.hex || $revisionSelectEvent.to.change.hex;
        let params = new URLSearchParams({ inspect: to });
        if (from !== to) params.set("inspectFrom", from);
        window.location.assign(`/?${params}`);
    }
    function escape(event: KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented || $hasModal || $hasMenu || document.querySelector("dialog[open], .action-menu, [role='menu']")) return;
        let target = event.target as HTMLElement;
        if (target.closest("textarea, input, [role='dialog'], .action-menu, .command-palette, [role='menu']")) return;
        if (route.type !== "default" && $workspaceController.routedTool) { event.preventDefault(); workspaceController.closeView(true); }
    }
</script>

<DisplayZoom />

<svelte:window onkeydown={escape} />

<Shell revsetOverride={route.type === "revision" ? route.revset : route.type === "default" ? route.inspection?.revset ?? null : null} revsetFromOverride={route.type === "default" ? route.inspection?.fromRevset ?? null : null}  >
    {#snippet children({ workspace, selection })}
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
            <BoundQuery query={selection} >
                {#snippet children({ data })}{#if data.type == "Detail"}
                    <RevisionPane revs={data} />
                {:else}
                    <Pane>
                        {#snippet header()}<h2 >No revisions match</h2>{/snippet}
                        {#snippet body()}<p >
                            This revset matches nothing.
                        </p>{/snippet}
                    </Pane>
                {/if}{/snippet}
                {#snippet error({ message })}<Pane>
                    {#snippet header()}<h2 >Error</h2>{/snippet}
                    {#snippet body()}<p >{message}</p>{/snippet}
                </Pane>{/snippet}
                {#snippet wait()}<Pane >
                    {#snippet header()}<h2 >Loading…</h2>{/snippet}
                </Pane>{/snippet}
            </BoundQuery>
            </div>
        {:else}
            <div class="workspace-view" bind:clientWidth={containerWidth}>
                <WorkspaceSurface {workspace} {selection} {compact} />
            </div>
        {/if}
    {/snippet}
</Shell>

<style>
    .workspace-view, .standalone-content { display: grid; min-width: 0; min-height: 0; overflow: hidden; }
</style>
