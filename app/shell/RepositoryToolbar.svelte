<script lang="ts">
    import { onMount } from "svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import { nativeRepositoryCommands, repositoryCommands } from "../commands/registry";
    import { effectiveTheme, toggleTheme } from "../display/theme";
    import { appZoom, nativeZoomEnabled, zoomCommands } from "../display/zoom";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { Operand } from "../messages/Operand";
    import type { RichHint } from "../mutators/BinaryMutator";
    import BinaryMutator from "../mutators/BinaryMutator";
    import { currentMutation, ignoreToggled, currentSource, currentTarget, hasModal, repoConfigEvent, repoStatusEvent } from "../stores";
    import { isTauri, query, trigger } from "../ipc";
    import ToggleWidget from "../controls/ToggleWidget.svelte";
    import BookmarkSpan from "../controls/BookmarkSpan.svelte";

    export let target: boolean;
    export let refreshing = false;
    export let onRefresh: () => void;
    let remoteName = "";
    let viewportWidth = 1440;
    let menuOpen = false;
    let recent: string[] = [];
    async function toggleMenu() {
        menuOpen = !menuOpen;
        if (menuOpen && isTauri()) {
            let result = await query<string[]>("query_recent_workspaces", null);
            if (result.type === "data") recent = result.value;
        }
    }
    async function openRecent(path: string) {
        menuOpen = false;
        let result = await query<RepoConfig>("query_workspace", { path });
        if (result.type === "data") repoConfigEvent.set(result.value);
        else repoConfigEvent.set({ type: "LoadError", absolute_path: path, message: result.message });
    }
    let toolbar: HTMLDivElement;
    $: remotes = $repoConfigEvent.type === "Workspace" ? $repoConfigEvent.git_remotes : [];
    $: if (!remotes.includes(remoteName)) remoteName = remotes[0] ?? "";


    let dropHint: RichHint | null = null;
    let maybe = false;

    $: setDropHint($currentSource, $currentTarget);
    $: if (isTauri()) trigger("set_modifier_state", { alt: $ignoreToggled });

    function setDropHint(source: Operand | null, target: Operand | null) {
        maybe = false;
        if (source) {
            let mutator = new BinaryMutator(source, target, $ignoreToggled);
            if (target) {
                let canDrop = mutator.canDrop();
                if (canDrop.type == "yes") {
                    dropHint = canDrop.hint;
                    return;
                } else if (canDrop.type == "maybe") {
                    dropHint = [canDrop.hint];
                    maybe = true;
                    return;
                }
            }

            let canDrag = mutator.canDrag();
            if (canDrag.type == "yes") {
                dropHint = canDrag.hint;
                return;
            }
        }

        dropHint = null;
    }

    onMount(() => { let refresh = () => { if (!refreshing) onRefresh(); }; window.addEventListener("gg:refresh-repository", refresh); return () => window.removeEventListener("gg:refresh-repository", refresh); });

    function runRepository(id: string) {
        menuOpen = false;
        repositoryCommands(remoteName).find(command => command.id === id)?.execute();
    }
    function onUndo() { runRepository("repository.undo"); }
    function onRedo() { runRepository("repository.redo"); }
    function onPush(_remote: string) { runRepository("repository.push"); }
    function onFetch(_remote: string) { runRepository("repository.fetch"); }
</script>

<svelte:window bind:innerWidth={viewportWidth} on:pointerdown={event => { if (menuOpen && !toolbar.contains(event.target as Node)) menuOpen = false; }} on:keydown={event => { if (event.key === "Escape" && menuOpen) { menuOpen = false; document.querySelector<HTMLButtonElement>('[aria-label="More repository actions"]')?.focus(); } }} />

<div class="repository-toolbar" bind:this={toolbar} role="group" aria-label="Repository actions" inert={$hasModal}>
    <div class="sync-actions" role="group" aria-label="Remote synchronization">
        <select aria-label="Git remote" title={remoteName || "No remote"} bind:value={remoteName} disabled={!remotes.length}>
            <button type="button" class="select-trigger"><selectedcontent></selectedcontent></button>
            {#each remotes as remote}<option value={remote}>{remote}</option>{:else}<option value="">No remote</option>{/each}
        </select>
        {#if viewportWidth > 380}
        <ActionWidget secondary tip="Fetch remote bookmarks" disabled={!remoteName || !!$currentMutation} onClick={() => onFetch(remoteName)}><Icon name="arrow-down" /> <span class="action-label">Fetch</span></ActionWidget>
        <ActionWidget secondary tip="Push all bookmarks" disabled={!remoteName || !!$currentMutation} onClick={() => onPush(remoteName)}><Icon name="arrow-up" /> <span class="action-label">Push</span></ActionWidget>
        {/if}
    </div>
    <button class="commands-button" type="button" on:click={() => window.dispatchEvent(new Event("gg:open-commands"))}>Commands</button>
    <div class="history-actions" role="group" aria-label="Operation history">
        {#if viewportWidth > 380}
        <ActionWidget secondary tip="Undo the latest operation" disabled={!!$currentMutation} onClick={onUndo}><Icon name="rotate-ccw" /> <span class="action-label">Undo</span></ActionWidget>
        {/if}
        <div class="more-actions">
            <button class="more-button" aria-label="More repository actions" aria-expanded={menuOpen} on:click={toggleMenu}><Icon name="more-horizontal" /></button>
            {#if menuOpen}
                <div class="action-menu">
                    {#if viewportWidth <= 600}
                        <select aria-label="Git remote" bind:value={remoteName} disabled={!remotes.length}>{#each remotes as remote}<option value={remote}>{remote}</option>{:else}<option value="">No remote</option>{/each}</select>
                        <ActionWidget secondary tip="Fetch remote bookmarks" disabled={!remoteName || !!$currentMutation} onClick={() => onFetch(remoteName)}><Icon name="arrow-down" /> <span class="action-label">Fetch</span></ActionWidget>
                        <ActionWidget secondary tip="Push all bookmarks" disabled={!remoteName || !!$currentMutation} onClick={() => onPush(remoteName)}><Icon name="arrow-up" /> <span class="action-label">Push</span></ActionWidget>
                        <ActionWidget secondary tip="Undo the latest operation" disabled={!!$currentMutation} onClick={onUndo}><Icon name="rotate-ccw" /> <span class="action-label">Undo</span></ActionWidget>
                        <hr />
                    {/if}
                    {#if isTauri()}
                        {#each nativeRepositoryCommands() as command}
                            <button type="button" on:click={() => { menuOpen = false; command.execute(); }}>{command.label}</button>
                        {/each}
                        {#if recent.length}
                            <span class="menu-heading">Recent workspaces</span>
                            {#each recent as path}
                                <button type="button" class="recent" title={path} on:click={() => openRecent(path)}>{path}</button>
                            {/each}
                        {/if}
                        {#if $nativeZoomEnabled}
                            <span class="menu-heading">App zoom · {Math.round($appZoom.level * 100)}%</span>
                            {#each zoomCommands($appZoom, true) as command}
                                <button type="button" disabled={!!command.reason} on:click={() => command.execute()}>{command.label}</button>
                            {/each}
                        {/if}
                        <hr />
                    {/if}
                    <button type="button" aria-label={`Theme: ${$effectiveTheme}. Switch to ${$effectiveTheme === "dark" ? "light" : "dark"} theme`} on:click={toggleTheme}><Icon name={$effectiveTheme === "dark" ? "sun" : "moon"} /> Theme: {$effectiveTheme === "dark" ? "Dark" : "Light"} · Switch to {$effectiveTheme === "dark" ? "light" : "dark"}</button>
                    <ActionWidget secondary tip="Refresh" disabled={refreshing} onClick={() => { onRefresh(); menuOpen = false; }}><Icon name="refresh-cw" /> {refreshing ? "Refreshing…" : "Refresh"}</ActionWidget>
                    <ActionWidget secondary tip="Redo the latest undone operation" disabled={!$repoStatusEvent?.can_redo || !!$currentMutation} onClick={onRedo}><Icon name="rotate-cw" /> Redo</ActionWidget>
                    <p class="operation-info" title={$repoStatusEvent?.operation_description}>{$repoStatusEvent?.operation_description ?? "No operation"}</p>
                    <label class="protection" class:overriding={$ignoreToggled}><ToggleWidget tip="Override immutability" bind:checked={$ignoreToggled} safe on="shield-off" off="shield" /><span>Override immutability</span></label>
                </div>
            {/if}
        </div>
    </div>
</div>

{#if dropHint}
    <div role="status" class="drag-bar" class:target class:maybe>
        <div>
            {#each dropHint as run, i}
                {#if typeof run == "string"}
                    <span>{run}{i == dropHint.length - 1 ? "." : ""}</span>
                {:else if run.type == "LocalBookmark" || run.type == "RemoteBookmark"}
                    <span><BookmarkSpan ref={run} /></span>
                {:else}
                    <span><IdSpan id={run} />{i == dropHint.length - 1 ? "." : ""}</span>
                {/if}
            {/each}
        </div>
    </div>
{/if}

<style>
    .repository-toolbar { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0; background: transparent; border: 0; border-radius: var(--radius-control); box-shadow: none; pointer-events: auto; min-width: 0; }
    .commands-button { display: inline-flex; align-items: center; min-height: var(--control-height); border: 0; border-radius: var(--radius-control); padding: 5px var(--control-padding-inline); background: transparent; color: var(--text); cursor: pointer; }
    @media (hover: hover) { .commands-button:hover { background: var(--hover); } }
    .commands-button:active { background: var(--control-pressed); }
    .sync-actions, .history-actions { display: flex; align-items: center; gap: var(--space-1); min-width: 0; flex-wrap: wrap; }
    select { min-width: 96px; max-width: 180px; font-size: var(--type-ui); }
    .repository-toolbar :global(button:not(.select-trigger)) { font-size: var(--type-ui); height: auto; max-width: 100%; }
    .more-actions { position: static; }
    .more-button { display: grid; place-items: center; min-width: 32px; min-height: 32px; padding: 5px var(--control-padding-inline); border: 0; background: transparent; border-radius: var(--radius-control); color: var(--text); cursor: pointer; }
    @media (hover: hover) { .more-button:hover { background: var(--hover); } }
    .more-button:active { background: var(--control-pressed); }
    .action-menu { position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + 6px); z-index: 70; width: min(300px, calc(100vw - 32px)); max-height: calc(100dvh - var(--workspace-topbar-height, 60px) - 20px); overflow: auto; overscroll-behavior: contain; padding: 5px; display: grid; gap: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--raised); box-shadow: var(--shadow-overlay); pointer-events: auto; }
    .action-menu :global(button) { justify-content: flex-start; }
    .action-menu > button { border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); padding: 6px 8px; text-align: start; cursor: pointer; }
    .action-menu > button:hover { background: var(--hover); }
    .action-menu > button:disabled { opacity: .5; cursor: default; }
    .menu-heading { padding: 5px 8px; font-size: var(--type-caption); color: var(--muted); }
    .recent { overflow-wrap: anywhere; }
    .action-menu .action-label { display: inline; }
    .protection { padding: 8px 7px 4px; margin-block-start: 4px; border-block-start: 1px solid var(--rule); display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-ui); color: var(--text); }
    .protection.overriding { color: var(--warning); }
    .operation-info { margin: 0; padding: 4px 8px; font-size: var(--type-caption); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text; pointer-events: auto; }
    .drag-bar { position: fixed; inset-block-end: 16px; inset-inline: 16px; margin-inline: auto; width: fit-content; max-width: calc(100% - 32px); padding: 10px 16px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-surface); box-shadow: var(--shadow-float); z-index: 60; font-size: 13px; pointer-events: none; }
    .drag-bar.target { color: var(--text); }
    .drag-bar.maybe { color: var(--warning); }
    @media (pointer: coarse), (max-width: 600px) {
        .repository-toolbar :global(button:not(.select-trigger)), select, .more-button { min-height: 44px; }
        .repository-toolbar :global(button:not(.select-trigger)), .more-button { min-width: 44px; }
        select { font-size: var(--type-ui); }
    }
    @media (max-width: 600px) {
        .repository-toolbar { flex-shrink: 0; flex-wrap: nowrap; gap: 4px; }
        .sync-actions { display: none; }
        .commands-button { display: block; min-height: 44px; border: 0; border-radius: var(--radius-control); padding: 8px; background: transparent; color: var(--text); }
        .history-actions { display: none; }
        .action-label { display: none; }
        select { width: 76px; min-width: 76px; max-width: 76px; }
    }
    .action-menu hr { width: 100%; border: 0; border-block-start: 1px solid var(--rule); margin: 4px 0; }
</style>
