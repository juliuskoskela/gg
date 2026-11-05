<script lang="ts">
    import CommandPalette from "../commands/CommandPalette.svelte";
    import { workspaceController } from "../workspace/state";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RepoStatus } from "../messages/RepoStatus";
    import { compactWorkspace, activeLogQuery, revisionSelectEvent, paneMode, logQueryRequest, repoStatusEvent, hasModal, selectWorkingCopy, navigationExpanded } from "../stores";
    import { query } from "../ipc";
    import Icon from "../controls/Icon.svelte";
    import Drawer from "../controls/Drawer.svelte";
    import RepositoryToolbar from "./RepositoryToolbar.svelte";
    import RepositoryNavigation from "./RepositoryNavigation.svelte";
    import PanelToggle from "../controls/PanelToggle.svelte";

    export let target = false;
    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    let menuOpen = false;
    let viewportWidth = 1440;
    let standalone = typeof window !== "undefined" && window.location.pathname !== "/";
    $: persistentNavigation = viewportWidth >= 768;
    $: if (persistentNavigation) menuOpen = false;
    let refreshing = false;
    let refreshError = "";
    $: workspaceName = workspace.absolute_path.split(/[\\/]/).filter(Boolean).pop() ?? "Repository";
    $: views = [
        { label: "History", icon: "git-branch", revset: workspace.query_choices.default ?? "all()" },
        { label: "Bookmarks", icon: "bookmark", revset: "bookmarks()" },
        { label: "Conflicts", icon: "git-merge", revset: "conflicts()" },
    ];
    $: savedViews = Object.entries(workspace.query_choices).filter(([name]) => name !== "default");
    $: currentQuery = $activeLogQuery ?? workspace.latest_query;
    $: activeView = views.find(view => view.revset === currentQuery)?.label
        ?? savedViews.find(([, revset]) => revset === currentQuery)?.[0].replaceAll("-", " ")
        ?? "Custom";

    function selectView(revset: string) {
        workspaceController.setPresentation("closed");
        if ($paneMode === "change") paneMode.set("both");
        logQueryRequest.set(revset);
        menuOpen = false;
    }

    async function refresh() {
        refreshing = true;
        refreshError = "";
        let config = workspace;
        let result = await query<RepoStatus | null>("query_snapshot", null);
        if (result.type === "data" && !result.value) result = await query<RepoStatus>("query_current_status", null);
        if (workspace !== config) { refreshing = false; return; }
        if (result.type === "data" && result.value) repoStatusEvent.set(result.value);
        if (result.type === "error") refreshError = result.message;
        refreshing = false;
    }
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<CommandPalette />

<div class="workspace-frame" class:with-navigation={persistentNavigation} class:expanded-navigation={$navigationExpanded} inert={$hasModal}>
    <header class="workspace-topbar" inert={($workspaceController.presentation === "full" || (($compactWorkspace || standalone) && !!$workspaceController.routedTool))} aria-hidden={($workspaceController.presentation === "full" || (($compactWorkspace || standalone) && !!$workspaceController.routedTool))}>
        {#if !persistentNavigation}<button class="navigation-trigger" type="button" aria-label="Open repository navigation" aria-expanded={menuOpen} aria-controls="workspace-navigation" on:click={() => menuOpen = true}><Icon name="menu" /></button>{/if}
        <div class="workspace-breadcrumb" data-tauri-drag-region>
            <h1 class="workspace-name" title={workspace.absolute_path}>{workspaceName}</h1>
            <span class="breadcrumb-divider">/</span><span class="view-name">{activeView}</span>
        </div>
        <RepositoryToolbar {target} {refreshing} onRefresh={refresh} />
    </header>
    {#if persistentNavigation}
        <aside inert={($workspaceController.presentation === "full" || (($compactWorkspace || standalone) && !!$workspaceController.routedTool))} aria-hidden={($workspaceController.presentation === "full" || (($compactWorkspace || standalone) && !!$workspaceController.routedTool))} class="workspace-navigation" id="workspace-navigation" aria-label="Repository navigation">
            <div class="navigation-scroll"><RepositoryNavigation {workspace} {currentQuery} collapsed={!$navigationExpanded} onSelect={selectView} onWorkingCopy={selectWorkingCopy} /></div>
            <div class="navigation-footer"><PanelToggle label={$navigationExpanded ? "Collapse repository navigation" : "Expand repository navigation"} text={$navigationExpanded ? "Collapse" : ""} controls="workspace-navigation" expanded={$navigationExpanded} onToggle={() => navigationExpanded.update(value => !value)} /></div>
        </aside>
    {:else}
        <Drawer id="workspace-navigation" open={menuOpen} title="Repository navigation" onClose={() => menuOpen = false}>
            <RepositoryNavigation {workspace} {currentQuery} onSelect={selectView} onWorkingCopy={() => { selectWorkingCopy(); menuOpen = false; }} />
        </Drawer>
    {/if}
    <main class="workspace-sheet" class:has-error={!!refreshError}>
        {#if refreshError}<p class="refresh-error" role="alert">Couldn’t refresh: {refreshError}</p>{/if}
        <div class="workspace-content"><slot /></div>
    </main>
</div>

<style>
    .workspace-frame { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); min-height: 0; overflow: hidden; }
    .workspace-frame.with-navigation { grid-template-columns: 56px minmax(0, 1fr); }
    .workspace-frame.with-navigation.expanded-navigation { grid-template-columns: 224px minmax(0, 1fr); }
    .workspace-navigation { grid-row: 2; grid-column: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--ground); border-inline-end: 1px solid var(--rule); }
    .navigation-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 8px; pointer-events: auto; }
    .navigation-footer { padding: 8px; }
    .with-navigation:not(.expanded-navigation) .navigation-scroll, .with-navigation:not(.expanded-navigation) .navigation-footer { padding: 6px; }
    .navigation-footer :global(button) { width: 100%; justify-content: flex-start; }
    .with-navigation:not(.expanded-navigation) .navigation-footer :global(button) { justify-content: center; }
    .with-navigation .workspace-sheet { grid-row: 2; grid-column: 2; }
    .workspace-topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; height: 40px; min-height: 40px; padding: 4px var(--pane-inset); background: var(--ground); border-block-end: 1px solid var(--rule); min-width: 0; }
    .navigation-trigger { display: grid; place-items: center; width: 32px; min-height: 32px; flex-shrink: 0; padding: 6px; background: transparent; color: var(--text); border: 0; border-radius: var(--radius-control); cursor: pointer; }
    .workspace-breadcrumb { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; font-size: 13px; color: var(--muted); }
    .workspace-name { margin: 0; color: var(--text); font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .view-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .workspace-sheet, .workspace-content { display: grid; grid-template-rows: minmax(0, 1fr); min-height: 0; min-width: 0; overflow: hidden; background: var(--surface); }
    .workspace-sheet.has-error { grid-template-rows: auto minmax(0, 1fr); }
    .refresh-error { margin: 0; padding: 8px 16px; color: var(--negative); font-size: 13px; }
    @media (hover: hover) { .navigation-trigger:hover { background: var(--hover); color: var(--text); } }
    :global(.overlay-titlebar) .workspace-topbar { padding-inline-start: 80px; }
    @media (max-width: 700px) { .view-name, .breadcrumb-divider { display: none; } }
    .navigation-trigger:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .navigation-trigger { width: 44px; min-height: 44px; } .workspace-topbar { height: auto; min-height: 52px; } }
    @media (max-width: 600px) { .workspace-topbar { flex-wrap: wrap; gap: 4px; padding: 2px 8px; } }
</style>
