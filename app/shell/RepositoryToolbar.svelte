<script lang="ts">
    import { onMount } from "svelte";
    import { mutationPending } from "../operations";
    import SelectWidget from "../controls/SelectWidget.svelte";
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
    $: remoteOptions = remotes.length ? remotes.map(value => ({ value })) : [{ value: "", label: "No remote" }];
    $: busy = !!$currentMutation || $mutationPending;
    $: redoReason = busy ? "Another operation is in progress" : !$repoStatusEvent?.can_redo ? "Nothing to redo. New operations clear redo history." : "";


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

<svelte:window on:pointerdown={event => { if (menuOpen && !toolbar.contains(event.target as Node)) menuOpen = false; }} on:keydown={event => { if (event.key === "Escape" && menuOpen) { menuOpen = false; document.querySelector<HTMLButtonElement>('[aria-label="More repository actions"]')?.focus(); } }} />

<div class="repository-toolbar" bind:this={toolbar} role="group" aria-label="Repository actions" inert={$hasModal}>
    <div class="sync-actions" role="group" aria-label="Remote synchronization">
        <div class="remote-select"><SelectWidget label="Git remote" title={remoteName || "No remote"} options={remoteOptions} bind:value={remoteName} disabled={!remotes.length}><svelte:fragment let:option>{option.value || "No remote"}</svelte:fragment></SelectWidget></div>
        <ActionWidget secondary tip="Fetch remote bookmarks" disabled={!remoteName || busy} onClick={() => onFetch(remoteName)}><Icon name="arrow-down" /> <span class="action-label">Fetch</span></ActionWidget>
        <ActionWidget secondary tip="Push all bookmarks" disabled={!remoteName || busy} onClick={() => onPush(remoteName)}><Icon name="arrow-up" /> <span class="action-label">Push</span></ActionWidget>
    </div>
    <div class="history-actions" role="group" aria-label="Operation history">
        <ActionWidget secondary tip="Undo the latest operation" disabled={busy} onClick={onUndo}><Icon name="rotate-ccw" /> <span class="action-label">Undo</span></ActionWidget>
        <span class="secondary-history"><ActionWidget secondary tip="Redo the latest undone operation" disabled={!!redoReason} disabledReason={redoReason} onClick={onRedo}><Icon name="rotate-cw" /> <span class="action-label">Redo</span></ActionWidget>
        <ActionWidget secondary tip="Refresh repository" disabled={refreshing || busy} onClick={onRefresh}><Icon name="refresh-cw" /></ActionWidget></span>
    </div>
    <button class="commands-button" type="button" aria-label="Commands" on:click={() => window.dispatchEvent(new Event("gg:open-commands"))}><Icon name="command" /><span class="action-label">Commands</span></button>
        <div class="more-actions">
            <button class="more-button" aria-label="More repository actions" aria-expanded={menuOpen} on:click={toggleMenu}><Icon name="more-horizontal" /></button>
            {#if menuOpen}
                <div class="action-menu">
                    <div class="mobile-actions">
                        <label>Git remote <SelectWidget label="Git remote" title={remoteName || "No remote"} options={remoteOptions} bind:value={remoteName} disabled={!remotes.length}><svelte:fragment let:option>{option.value || "No remote"}</svelte:fragment></SelectWidget></label>
                        <button type="button" disabled={!remoteName || busy} on:click={() => onFetch(remoteName)}>Fetch remote bookmarks</button>
                        <button type="button" disabled={!remoteName || busy} on:click={() => onPush(remoteName)}>Push all bookmarks</button>
                        <button type="button" disabled={!!redoReason} title={redoReason} on:click={onRedo}>Redo</button>
                        <button type="button" disabled={refreshing || busy} on:click={() => { menuOpen = false; onRefresh(); }}>Refresh repository</button>
                        <hr />
                    </div>
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
                    <p class="operation-info" title={$repoStatusEvent?.operation_description}>{$repoStatusEvent?.operation_description ?? "No operation"}</p>
                    <label class="protection" class:overriding={$ignoreToggled}><ToggleWidget tip="Override immutability" bind:checked={$ignoreToggled} safe on="shield-off" off="shield" /><span>Override immutability</span></label>
                </div>
            {/if}
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
    .repository-toolbar { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: var(--tool-group-gap); padding: 0; background: transparent; border: 0; border-radius: var(--radius-control); box-shadow: none; pointer-events: auto; min-width: 0; }
    .commands-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--control-gap); min-height: var(--control-height); border: 0; border-radius: var(--radius-control); padding: 5px var(--control-padding-inline); background: transparent; color: var(--text); cursor: pointer; }
    @media (hover: hover) { .commands-button:hover { background: var(--hover); } }
    .commands-button:active { background: var(--control-pressed); }
    .sync-actions, .history-actions { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; flex-wrap: nowrap; }
    .remote-select { width: 104px; min-width: 0; }
    .repository-toolbar :global(button:not(.select-trigger)) { font-size: var(--type-ui); max-width: 100%; }
    .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .commands-button, .more-button { height: var(--control-height); }
    .more-actions { position: static; }
    .more-button { display: grid; place-items: center; min-width: 32px; min-height: 32px; padding: 5px var(--control-padding-inline); border: 0; background: transparent; border-radius: var(--radius-control); color: var(--text); cursor: pointer; }
    @media (hover: hover) { .more-button:hover { background: var(--hover); } }
    .more-button:active { background: var(--control-pressed); }
    .action-menu { position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + 6px); z-index: 70; width: min(300px, calc(100vw - 32px)); max-height: calc(100dvh - var(--workspace-topbar-height, 60px) - 20px); overflow: auto; overscroll-behavior: contain; padding: 5px; display: grid; gap: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--popover-surface, var(--raised)); box-shadow: var(--shadow-overlay); pointer-events: auto; }
    .secondary-history { display: contents; }
    .mobile-actions { display: none; }
    .mobile-actions label { display: grid; gap: 4px; padding: 6px 8px; color: var(--muted); font-size: var(--type-caption); }
    .mobile-actions > button { width: 100%; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); padding: 8px; text-align: start; cursor: pointer; }
    .mobile-actions > button:hover { background: var(--hover); }
    .mobile-actions > button:disabled { color: var(--text-disabled); cursor: default; }
    .action-menu :global(button) { justify-content: flex-start; }
    .action-menu > button { border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); padding: 6px 8px; text-align: start; cursor: pointer; }
    .action-menu > button:hover { background: var(--hover); }
    .action-menu > button:disabled { opacity: .5; cursor: default; }
    .menu-heading { padding: 5px 8px; font-size: var(--type-caption); color: var(--muted); }
    .recent { overflow-wrap: anywhere; }
    .protection { padding: 8px 7px 4px; margin-block-start: 4px; border-block-start: 1px solid var(--rule); display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-ui); color: var(--text); }
    .protection.overriding { color: var(--warning); }
    .operation-info { margin: 0; padding: 4px 8px; font-size: var(--type-caption); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: text; pointer-events: auto; }
    .drag-bar { position: fixed; inset-block-end: 16px; inset-inline: 16px; margin-inline: auto; width: fit-content; max-width: calc(100% - 32px); padding: 10px 16px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-surface); box-shadow: var(--shadow-float); z-index: 60; font-size: 13px; pointer-events: none; }
    .drag-bar.target { color: var(--text); }
    .drag-bar.maybe { color: var(--warning); }
    @media (pointer: coarse), (max-width: 600px) {
        .repository-toolbar :global(button:not(.select-trigger)), .more-button { min-height: 44px; }
        .repository-toolbar :global(button:not(.select-trigger)), .more-button { min-width: 44px; }
        .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .commands-button, .more-button { height: 44px; }
    }
    @media (max-width: 1100px) { .action-label { display: none; } }
    @media (max-width: 600px) {
        .repository-toolbar { flex: 0 1 auto; gap: var(--panel-gap); }
        .sync-actions, .secondary-history { display: none; }
        .mobile-actions { display: grid; }
    }
    .action-menu hr { width: 100%; border: 0; border-block-start: 1px solid var(--rule); margin: 4px 0; }
</style>
