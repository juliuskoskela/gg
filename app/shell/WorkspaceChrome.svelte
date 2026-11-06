<script lang="ts">
    import { onMount, tick } from "svelte";
    import { dock } from "../workspace/dock";
    import CommandPalette from "../commands/CommandPalette.svelte";
    import { workspaceController } from "../workspace/state";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RepoStatus } from "../messages/RepoStatus";
    import { activeLogQuery, logQueryRequest, repoStatusEvent, hasModal, selectWorkingCopy, navigationExpanded } from "../stores";
    import { query } from "../ipc";
    import Icon from "../controls/Icon.svelte";
    import Drawer from "../controls/Drawer.svelte";
    import RepositoryToolbar from "./RepositoryToolbar.svelte";
    import RepositoryNavigation from "./RepositoryNavigation.svelte";
    import PanelToggle from "../controls/PanelToggle.svelte";
    import PlaceMenu from "./PlaceMenu.svelte";
    import ViewsMenu from "./ViewsMenu.svelte";

    export let target = false;
    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    let menuOpen = false;
    let viewportWidth = 1440;
    let standalone = typeof window !== "undefined" && window.location.pathname !== "/";
    $: persistentNavigation = viewportWidth >= 768;
    $: if (persistentNavigation) menuOpen = false;
    let refreshing = false;
    let refreshError = "";
    $: currentQuery = $activeLogQuery ?? workspace.latest_query;

    function selectView(revset: string) {
        workspaceController.setPresentation("closed");
        logQueryRequest.set(revset);
        menuOpen = false;
    }

    onMount(() => {
        if (!standalone && new URLSearchParams(window.location.search).get("panel") === "settings") void openSettings();
    });

    async function openSettings() {
        if (standalone) {
            window.location.assign("/?panel=settings");
            return;
        }
        menuOpen = false;
        dock.open("settings");
        await tick();
        document.getElementById("panel-tab-settings")?.focus();
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
    <header class="workspace-topbar">
        {#if !persistentNavigation}<button class="navigation-trigger" type="button" aria-label="Open repository navigation" aria-expanded={menuOpen} aria-controls="workspace-navigation" on:click={() => menuOpen = true}><Icon name="menu" /></button>{/if}
        <PlaceMenu {workspace} />
        {#if !standalone}<div class="views-control"><ViewsMenu /></div>{/if}
        <div class="topbar-actions">
            <RepositoryToolbar {target} {refreshing} onRefresh={refresh} />
        </div>
    </header>
    {#if persistentNavigation}
        <aside class="workspace-navigation" id="workspace-navigation" aria-label="Repository navigation">
            <div class="navigation-scroll"><RepositoryNavigation {workspace} {currentQuery} collapsed={!$navigationExpanded} onSelect={selectView} onWorkingCopy={selectWorkingCopy} /></div>
            <div class="navigation-footer">
                <button class="settings-trigger" type="button" aria-label="Settings" title="Settings" aria-controls="panel-settings" on:click={openSettings}><Icon name="settings" />{#if $navigationExpanded}<span>Settings</span>{/if}</button>
                <PanelToggle label={$navigationExpanded ? "Collapse repository navigation" : "Expand repository navigation"} text={$navigationExpanded ? "Collapse" : ""} controls="workspace-navigation" expanded={$navigationExpanded} onToggle={() => navigationExpanded.update(value => !value)} /></div>
        </aside>
    {:else}
        <Drawer id="workspace-navigation" open={menuOpen} title="Repository navigation" onClose={() => menuOpen = false}>
            <div class="drawer-navigation">
                <RepositoryNavigation {workspace} {currentQuery} onSelect={selectView} onWorkingCopy={() => { selectWorkingCopy(); menuOpen = false; }} />
                <button class="settings-trigger" type="button" aria-label="Settings" aria-controls="panel-settings" on:click={openSettings}><Icon name="settings" /><span>Settings</span></button>
            </div>
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
    .navigation-footer { display: grid; gap: var(--space-1); padding: 8px; }
    .settings-trigger { display: flex; align-items: center; gap: var(--control-gap); min-height: var(--control-height); padding: 5px var(--control-padding-inline); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); text-align: start; cursor: pointer; }
    .drawer-navigation { display: flex; flex-direction: column; min-height: 100%; gap: 16px; }
    .drawer-navigation > .settings-trigger { margin-block-start: auto; min-height: 44px; }
    @media (hover: hover) { .settings-trigger:hover { background: var(--interaction-hover, var(--hover)); } }
    .settings-trigger:active { background: var(--interaction-pressed, var(--control-pressed)); }
    .with-navigation:not(.expanded-navigation) .navigation-scroll, .with-navigation:not(.expanded-navigation) .navigation-footer { padding: 6px; }
    .navigation-footer :global(button) { width: 100%; justify-content: flex-start; }
    .with-navigation:not(.expanded-navigation) .navigation-footer :global(button) { justify-content: center; }
    .with-navigation .workspace-sheet { grid-row: 2; grid-column: 2; }
    .workspace-topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--panel-gap); flex-wrap: wrap; min-height: 40px; padding: 3px var(--pane-inset); background: var(--ground); border-block-end: 1px solid var(--rule); min-width: 0; }
    .navigation-trigger { display: grid; place-items: center; width: 32px; min-height: 32px; flex-shrink: 0; padding: 6px; background: transparent; color: var(--text); border: 0; border-radius: var(--radius-control); cursor: pointer; }
    .views-control { margin-inline-start: auto; }
    .views-control + .topbar-actions { margin-inline-start: 0; }
    .topbar-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--panel-gap); margin-inline-start: auto; min-width: 0; max-width: 100%; }
    .workspace-sheet, .workspace-content { display: grid; grid-template-rows: minmax(0, 1fr); min-height: 0; min-width: 0; overflow: hidden; background: var(--surface); }
    .workspace-sheet.has-error { grid-template-rows: auto minmax(0, 1fr); }
    .refresh-error { margin: 0; padding: 8px 16px; color: var(--negative); font-size: 13px; }
    @media (hover: hover) { .navigation-trigger:hover { background: var(--hover); color: var(--text); } }
    :global(.overlay-titlebar) .workspace-topbar { padding-inline-start: 80px; }

    .navigation-trigger:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .navigation-trigger { width: 44px; min-height: 44px; } .workspace-topbar { height: auto; min-height: 52px; } }
    @media (max-width: 600px) { .workspace-topbar { gap: var(--panel-gap); padding: 4px var(--pane-inset); } .topbar-actions { flex: 1 0 100%; justify-content: flex-end; } }
</style>
