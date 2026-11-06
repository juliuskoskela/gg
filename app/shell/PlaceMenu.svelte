<script lang="ts">
    import { onDestroy, tick } from "svelte";
    import { get } from "svelte/store";
    import TextField from "../controls/TextField.svelte";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { WorkspaceContext } from "../messages/WorkspaceContext";
    import { nativeRepositoryCommands, type Command } from "../commands/registry";
    import { isTauri, query } from "../ipc";
    import { repoConfigEvent } from "../stores";

    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    let root: HTMLDivElement;
    let identityButton: HTMLButtonElement;
    let panel: HTMLDivElement;
    let context: WorkspaceContext | null = null;
    let loading = false;
    let failed = false;
    let open = false;
    let recent: string[] = [];
    let recentLoading = false;
    let recentFailed = false;
    let pathField = "";
    let contextRequest = 0;
    let recentRequest = 0;
    let navigationRequest = 0;
    let native = isTauri();
    let commands = nativeRepositoryCommands();

    $: folder = workspace.absolute_path.split(/[\\/]/).filter(Boolean).pop() ?? "Repository";
    $: projectLabel = context?.project_name ?? folder;
    $: workspaceLabel = context?.workspace_name ?? "default";
    $: void loadContext(workspace.absolute_path);

    onDestroy(() => { contextRequest++; recentRequest++; navigationRequest++; });

    async function loadContext(_path: string) {
        let current = ++contextRequest;
        navigationRequest++;
        close();
        context = null;
        loading = true;
        failed = false;
        let result = await query<WorkspaceContext>("query_workspace_context", null);
        if (current !== contextRequest) return;
        loading = false;
        if (result.type === "data") context = result.value;
        else failed = true;
    }

    function close(returnFocus = false) {
        open = false;
        recentRequest++;
        if (returnFocus) identityButton?.focus();
    }

    async function show(last = false) {
        open = true;
        pathField = "";
        recent = [];
        recentLoading = true;
        recentFailed = false;
        let current = ++recentRequest;
        let path = workspace.absolute_path;
        void query<string[]>("query_recent_workspaces", null).then(result => {
            if (!open || current !== recentRequest || path !== workspace.absolute_path) return;
            recentLoading = false;
            if (result.type === "data") recent = [...new Set(result.value)].filter(item => item && item !== path);
            else recentFailed = true;
        });
        await tick();
        if (open) {
            let items = focusable();
            items[last ? items.length - 1 : 0]?.focus();
        }
    }

    function focusable() {
        return Array.from(panel?.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled), input:not(:disabled)") ?? []);
    }

    function navigate(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
        }
        if (event.target instanceof HTMLInputElement) return;
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let items = focusable();
        let index = items.indexOf(document.activeElement as HTMLButtonElement);
        let next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    }

    async function openPath(path: string) {
        let from = workspace.absolute_path;
        close(true);
        if (!path || path === from) return;
        let current = ++navigationRequest;
        let config = get(repoConfigEvent);
        let result = await query<RepoConfig>("query_workspace", { path });
        if (current !== navigationRequest || workspace.absolute_path !== from || get(repoConfigEvent) !== config) return;
        if (result.type === "data") repoConfigEvent.set(result.value);
        else repoConfigEvent.set({ type: "LoadError", absolute_path: path, message: result.message });
    }

    function execute(command: Command) {
        close(true);
        if (!command.reason) command.execute();
    }

    function pathName(path: string) { return path.split(/[\\/]/).filter(Boolean).pop() ?? path; }
</script>

<svelte:window on:pointerdown={event => { if (open && !root.contains(event.target as Node)) close(); }} on:focusin={event => { if (open && !root.contains(event.target as Node)) close(); }} />

<div class="place" bind:this={root}>
    <button bind:this={identityButton} type="button" class="place-button" aria-label="Repository navigation: {workspaceLabel}@{projectLabel}" aria-haspopup="dialog" aria-expanded={open} aria-controls="repository-navigation" title="Switch workspace or open repository" on:click={() => open ? close() : show()} on:keydown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(event.key === "ArrowUp"); }
        else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); }
    }}>
        <span class="place-name workspace-name" class:alternate-workspace={workspaceLabel !== "default"}>{workspaceLabel}</span><span class="place-rule" aria-hidden="true">@</span><span class="place-name project-name">{projectLabel}</span>
        <svg class="chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    {#if open}
        <div id="repository-navigation" class="place-menu" bind:this={panel} role="dialog" aria-label="Repository navigation" on:keydown={navigate} tabindex="-1">
            <p class="place-path" title={context?.repo_path ?? workspace.absolute_path}>{context?.repo_path ?? workspace.absolute_path}</p>
            {#if native}
                <div class="menu-group">
                    {#each commands.filter(command => ["repository.open", "repository.init", "repository.clone"].includes(command.id)) as command}
                        <button type="button" disabled={!!command.reason} title={command.reason ?? undefined} on:click={() => execute(command)}><span>{command.label}</span><small class="shortcut">{command.shortcut ?? ""}</small></button>
                    {/each}
                </div>
            {:else}
                <form class="path-form" on:submit|preventDefault={() => openPath(pathField.trim())}>
                    <label for="repository-path">Open repository</label>
                    <div class="path-controls"><TextField id="repository-path" label="Repository path" placeholder="Path to a repository" bind:value={pathField} /><button type="submit" disabled={!pathField.trim()}>Open</button></div>
                </form>
            {/if}
            <section class="menu-group" aria-label="Workspaces" aria-busy={loading}>
                <h2>Workspaces</h2>
                {#if context?.workspaces.length}
                    {#each context.workspaces as record}
                        <button type="button" class="location-item" disabled={!record.path} aria-current={record.name === context.workspace_name ? "page" : undefined} title={record.path ?? "Path not recorded"} on:click={() => record.path && openPath(record.path)}>
                            <span class="location-heading"><span>{record.name}</span>{#if record.name === context.workspace_name}<small>Current</small>{/if}</span>
                            <small class="location-path">{record.path ?? "Path not recorded"}</small>
                        </button>
                    {/each}
                {:else}
                    <p class="place-note">{failed ? "Couldn’t list workspaces." : loading ? "Loading workspaces…" : "No other workspaces recorded."}</p>
                {/if}
            </section>
            <section class="menu-group" aria-label="Recent workspaces" aria-busy={recentLoading}>
                <h2>Recent workspaces</h2>
                {#each recent as path}
                    <button type="button" class="location-item" title={path} on:click={() => openPath(path)}><span>{pathName(path)}</span><small class="location-path">{path}</small></button>
                {:else}
                    <p class="place-note">{recentLoading ? "Loading recent workspaces…" : recentFailed ? "Couldn’t load recent workspaces." : "No recent workspaces."}</p>
                {/each}
            </section>
            {#if native}
                <div class="menu-group">
                    {#each commands.filter(command => ["repository.reopen", "repository.close"].includes(command.id)) as command}
                        <button type="button" disabled={!!command.reason} title={command.reason ?? undefined} on:click={() => execute(command)}><span>{command.label}</span><small class="shortcut">{command.shortcut ?? ""}</small></button>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .place { position: relative; display: flex; flex: 1 1 160px; align-items: center; min-width: 0; }
    .place-button { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; min-height: 32px; padding: 4px 6px; border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); line-height: 20px; text-align: start; cursor: pointer; }
    .place-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .workspace-name { flex-shrink: 1; }
    .project-name { flex-shrink: 2; }
    .place-rule { flex: none; color: var(--muted); }
    .alternate-workspace { color: var(--ref-workspace); }
    .chevron { flex: none; margin-inline-start: 6px; color: var(--muted); }
    .place-menu { position: absolute; inset-inline-start: 0; inset-block-start: calc(100% + 4px); z-index: 70; width: min(360px, calc(100vw - 24px)); max-height: min(640px, calc(100dvh - 80px)); overflow: auto; overscroll-behavior: contain; padding: 5px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
    .menu-group { display: grid; gap: 2px; padding-block: 5px; border-block-start: 1px solid var(--rule); }
    .place-menu button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); text-align: start; cursor: pointer; }
    .place-menu button:disabled { color: var(--muted); cursor: default; }
    .place-menu button[aria-current="page"] { background: var(--interaction-selected, var(--hover)); }
    .place-menu .location-item { display: grid; justify-content: stretch; gap: 2px; }
    .location-item > span, .location-heading > span { min-width: 0; overflow-wrap: anywhere; }
    .location-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .location-heading small { flex: none; }
    .location-heading small, .location-path, .shortcut, .place-path, .place-note, h2 { color: var(--muted); font-size: var(--type-caption); font-weight: 400; }
    .location-path, .place-path, .place-note { overflow-wrap: anywhere; }
    .shortcut { flex: none; }
    .place-path, .place-note, h2 { margin: 0; padding: 4px 8px; }
    .path-form { padding: 6px 4px 10px; }
    .path-form label { display: block; margin: 0 4px 6px; color: var(--text); font-size: var(--type-ui); }
    .path-controls { display: flex; gap: 6px; }
    .path-form :global(.text-field) { flex: 1; min-width: 0; font-size: var(--type-ui); }
    .path-form button { width: auto; }
    .place-button:focus-visible, .place-menu button:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: calc(-1 * var(--focus-width)); }
    .place-menu button:focus-visible { background: var(--interaction-hover, var(--hover)); }
    .place-menu button[aria-current="page"]:focus-visible { background: var(--interaction-selected-hover, var(--active)); }
    .place-button[aria-expanded="true"] { background: var(--interaction-selected, var(--hover)); }
    .place-menu button:focus-visible small, .place-menu button[aria-current="page"] small { color: var(--text); }
    @media (hover: hover) {
        .place-button:hover, .place-menu button:hover:not(:disabled) { background: var(--interaction-hover, var(--hover)); }
        .place-menu button[aria-current="page"]:hover:not(:disabled) { background: var(--interaction-selected-hover, var(--active)); }
        .place-menu button:hover:not(:disabled) small { color: var(--text); }
    }
    .place-button:active, .place-menu button:active:not(:disabled) { background: var(--interaction-pressed, var(--control-pressed)); }
    .place-menu button[aria-current="page"]:active:not(:disabled) { background: var(--interaction-selected-pressed, var(--control-pressed)); }
    @media (max-width: 600px) { .shortcut { display: none; } }
    @media (pointer: coarse), (max-width: 600px) { .place-button, .place-menu button, .path-form :global(.text-field) { min-height: 44px; } }
</style>
