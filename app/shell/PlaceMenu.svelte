<script lang="ts">
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { WorkspaceContext } from "../messages/WorkspaceContext";
    import type { WorkspaceRecord } from "../messages/WorkspaceRecord";
    import { nativeRepositoryCommands } from "../commands/registry";
    import { isTauri, query } from "../ipc";
    import { repoConfigEvent } from "../stores";

    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    let root: HTMLDivElement;
    let projectButton: HTMLButtonElement;
    let workspaceButton: HTMLButtonElement;
    let context: WorkspaceContext | null = null;
    let loading = false;
    let failed = false;
    let projectOpen = false;
    let workspaceOpen = false;
    let recent: string[] = [];
    let pathField = "";
    let request = 0;

    $: folder = workspace.absolute_path.split(/[\\/]/).filter(Boolean).pop() ?? "Repository";
    $: projectLabel = context?.project_name ?? "Project";
    $: workspaceLabel = context?.workspace_name ?? folder;
    $: void loadContext(workspace.absolute_path);

    async function loadContext(_path: string) {
        let current = ++request;
        loading = true;
        failed = false;
        let result = await query<WorkspaceContext>("query_workspace_context", null);
        if (current !== request) return;
        loading = false;
        if (result.type === "data") context = result.value;
        else { context = null; failed = true; }
    }

    function closeMenus() { projectOpen = false; workspaceOpen = false; }

    async function toggleProject() {
        workspaceOpen = false;
        projectOpen = !projectOpen;
        if (!projectOpen) return;
        pathField = "";
        let result = await query<string[]>("query_recent_workspaces", null);
        if (projectOpen && result.type === "data") recent = result.value.filter(path => path !== workspace.absolute_path);
    }

    function toggleWorkspace() {
        projectOpen = false;
        workspaceOpen = !workspaceOpen;
    }

    async function openPath(path: string) {
        closeMenus();
        if (!path || path === workspace.absolute_path) return;
        let result = await query<RepoConfig>("query_workspace", { path });
        if (result.type === "data") repoConfigEvent.set(result.value);
        else repoConfigEvent.set({ type: "LoadError", absolute_path: path, message: result.message });
    }

    function openRepository() {
        closeMenus();
        nativeRepositoryCommands().find(command => command.id === "repository.open")?.execute();
    }

    function chooseWorkspace(record: WorkspaceRecord) {
        if (!record.path) return;
        openPath(record.path);
    }
</script>

<svelte:window
    on:pointerdown={event => { if ((projectOpen || workspaceOpen) && !root.contains(event.target as Node)) closeMenus(); }}
    on:keydown={event => {
        if (event.key !== "Escape" || (!projectOpen && !workspaceOpen)) return;
        event.preventDefault();
        event.stopPropagation();
        let project = projectOpen;
        closeMenus();
        (project ? projectButton : workspaceButton).focus();
    }} />

<div class="place" bind:this={root} aria-busy={loading}>
    <button bind:this={projectButton} type="button" class="place-button" aria-haspopup="menu" aria-expanded={projectOpen} aria-controls="project-menu" title={context?.repo_path ?? workspace.absolute_path} on:click={toggleProject}>
        <span class="place-kicker">Project</span>
        <span class="place-name">{projectLabel}</span>
    </button>
    <span class="place-rule" aria-hidden="true">/</span>
    <button bind:this={workspaceButton} type="button" class="place-button" aria-haspopup="menu" aria-expanded={workspaceOpen} aria-controls="workspace-menu" title={context?.workspace_path ?? workspace.absolute_path} on:click={toggleWorkspace}>
        <span class="place-kicker">Workspace</span>
        <span class="place-name">{workspaceLabel}</span>
    </button>
    {#if projectOpen}
        <div id="project-menu" class="place-menu" role="menu" aria-label="Project">
            <p class="place-path">{context?.repo_path ?? workspace.absolute_path}</p>
            {#if failed}<p class="place-note">Couldn’t load the project name.</p>{/if}
            {#if isTauri()}<button type="button" role="menuitem" on:click={openRepository}>Open repository…</button>{/if}
            {#if recent.length}
                <p class="place-note">Recent repositories</p>
                {#each recent as path}<button type="button" role="menuitem" class="path-item" title={path} on:click={() => openPath(path)}>{path}</button>{/each}
            {/if}
            <form class="path-form" on:submit|preventDefault={() => openPath(pathField.trim())}>
                <input aria-label="Repository path" placeholder="Path to a repository" bind:value={pathField} />
                <button type="submit" disabled={!pathField.trim()}>Open</button>
            </form>
        </div>
    {/if}
    {#if workspaceOpen}
        <div id="workspace-menu" class="place-menu" role="menu" aria-label="Workspace">
            {#if context}
                {#each context.workspaces as record}
                    <button type="button" role="menuitem" class="workspace-item" disabled={!record.path} aria-current={record.name === context.workspace_name ? "page" : undefined} title={record.path ?? "Path not recorded"} on:click={() => chooseWorkspace(record)}>
                        <span>{record.name}</span>
                        <small>{record.path ?? "Path not recorded"}</small>
                    </button>
                {/each}
            {:else}
                <p class="place-note">{failed ? "Couldn’t list workspaces." : "Loading workspaces…"}</p>
                <p class="place-path">{workspace.absolute_path}</p>
            {/if}
        </div>
    {/if}
</div>

<style>
    .place { position: relative; display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; }
    .place-button { display: flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%; min-height: 32px; padding: 4px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: 13px; text-align: start; cursor: pointer; }
    .place-kicker { flex-shrink: 0; color: var(--muted); font-size: var(--type-caption); }
    .place-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .place-rule { color: var(--muted); font-size: 13px; }
    .place-menu { position: absolute; inset-inline-start: 0; inset-block-start: calc(100% + 4px); z-index: 70; width: min(360px, calc(100vw - 24px)); max-height: min(420px, calc(100dvh - 80px)); overflow: auto; overscroll-behavior: contain; display: grid; gap: 2px; padding: 6px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
    .place-menu > button, .path-form button { min-height: 32px; padding: 6px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: 13px; text-align: start; cursor: pointer; }
    .place-menu > button:disabled { color: var(--muted); cursor: default; }
    .place-menu > button[aria-current="page"] { font-weight: 500; background: var(--hover); }
    .workspace-item { display: grid; gap: 2px; }
    .workspace-item small, .place-path, .place-note { color: var(--muted); font-size: var(--type-caption); }
    .place-path, .place-note { margin: 0; padding: 4px 8px; overflow-wrap: anywhere; }
    .path-item { overflow-wrap: anywhere; }
    .path-form { display: flex; gap: 6px; padding: 4px; }
    .path-form input { flex: 1; min-width: 0; font-size: 13px; }
    .path-form button:disabled { color: var(--muted); cursor: default; }
    @media (hover: hover) {
        .place-button:hover, .place-menu > button:hover:not(:disabled), .path-form button:hover:not(:disabled) { background: var(--hover); }
    }
    .place-button:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .place-button, .place-menu > button, .path-form button { min-height: 44px; } }
    @media (max-width: 700px) { .place-kicker { display: none; } }
</style>
