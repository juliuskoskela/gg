<script lang="ts">
    import { onMount } from "svelte";
    import { mutationPending } from "../operations";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import { repositoryCommands } from "../commands/registry";
    import type { Operand } from "../messages/Operand";
    import type { RichHint } from "../mutators/BinaryMutator";
    import BinaryMutator from "../mutators/BinaryMutator";
    import { currentMutation, ignoreToggled, currentSource, currentTarget, hasModal, repoConfigEvent, repoStatusEvent } from "../stores";
    import { isTauri, trigger } from "../ipc";
    import BookmarkSpan from "../controls/BookmarkSpan.svelte";

    export let target: boolean;
    export let refreshing = false;
    export let onRefresh: () => void;
    let remoteName = "";
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
        repositoryCommands(remoteName).find(command => command.id === id)?.execute();
    }
    function onUndo() { runRepository("repository.undo"); }
    function onRedo() { runRepository("repository.redo"); }
    function onPush(_remote: string) { runRepository("repository.push"); }
    function onFetch(_remote: string) { runRepository("repository.fetch"); }
</script>

<div class="repository-toolbar" role="group" aria-label="Repository actions" inert={$hasModal}>
    <div class="sync-actions" role="group" aria-label="Remote synchronization">
        <ActionWidget secondary tip="Fetch remote bookmarks" disabled={!remoteName || busy} onClick={() => onFetch(remoteName)}><Icon name="arrow-down" /> <span class="action-label">Fetch</span></ActionWidget>
        <ActionWidget secondary tip="Push all bookmarks" disabled={!remoteName || busy} onClick={() => onPush(remoteName)}><Icon name="arrow-up" /> <span class="action-label">Push</span></ActionWidget>
    </div>
    <div class="history-actions" role="group" aria-label="Operation history">
        <ActionWidget secondary tip="Undo the latest operation" disabled={busy} onClick={onUndo}><Icon name="rotate-ccw" /> <span class="action-label">Undo</span></ActionWidget>
        <span class="secondary-history"><ActionWidget secondary tip="Redo the latest undone operation" disabled={!!redoReason} disabledReason={redoReason} onClick={onRedo}><Icon name="rotate-cw" /> <span class="action-label">Redo</span></ActionWidget>
        <ActionWidget secondary tip="Refresh repository" disabled={refreshing || busy} onClick={onRefresh}><Icon name="refresh-cw" /></ActionWidget></span>
    </div>
    <button class="commands-button" type="button" aria-label="Commands" on:click={() => window.dispatchEvent(new Event("gg:open-commands"))}><Icon name="command" /><span class="action-label">Commands</span></button>
    <div class="remote-select"><SelectWidget label="Git remote" title={remoteName || "No remote"} options={remoteOptions} bind:value={remoteName} disabled={!remotes.length}><svelte:fragment let:option>{option.value || "No remote"}</svelte:fragment></SelectWidget></div>
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
    .commands-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--control-gap); min-height: var(--control-height); border: 0; border-radius: var(--radius-control); padding: 5px var(--control-padding-inline); background: transparent; color: var(--text); line-height: 20px; cursor: pointer; }
    @media (hover: hover) { .commands-button:hover { background: var(--hover); } }
    .commands-button:active { background: var(--control-pressed); }
    /* proximity carries the grouping: related actions touch, groups get the wider gap */
    .repository-toolbar { gap: 20px; }
    .sync-actions, .history-actions { display: flex; align-items: center; gap: 2px; min-width: 0; flex-wrap: nowrap; }
    .remote-select :global(select) { height: var(--control-height); padding-block: 0; }
    .remote-select :global(.select-trigger) { min-height: 0; height: 100%; padding-block: 0; }
    .remote-select { width: 104px; min-width: 0; }
    .repository-toolbar :global(button:not(.select-trigger)) { font-size: var(--type-ui); max-width: 100%; }
    .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .commands-button { height: var(--control-height); }
    .secondary-history { display: contents; }
    .drag-bar { position: fixed; inset-block-end: 16px; inset-inline: 16px; margin-inline: auto; width: fit-content; max-width: calc(100% - 32px); padding: 10px 16px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-surface); box-shadow: var(--shadow-float); z-index: 60; font-size: 13px; pointer-events: none; }
    .drag-bar.target { color: var(--text); }
    .drag-bar.maybe { color: var(--warning); }
    @media (pointer: coarse), (max-width: 600px) {
        .repository-toolbar :global(button:not(.select-trigger)) { min-height: 44px; }
        .repository-toolbar :global(button:not(.select-trigger)) { min-width: 44px; }
        .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .commands-button { height: 44px; }
    }
    @media (max-width: 1100px) { .action-label { display: none; } }
    @media (max-width: 600px) {
        /* one row of actions; the narrowest screens scroll it rather than stacking a third chrome row */
        .repository-toolbar { flex: 0 1 auto; flex-wrap: nowrap; gap: 2px; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; margin-inline-start: auto; }
        .repository-toolbar::-webkit-scrollbar { display: none; }
        .sync-actions, .history-actions { gap: 0; flex-shrink: 0; }
        .remote-select { width: 92px; flex-shrink: 0; }
        .remote-select :global(select) { height: 44px; }
    }
    /* a faded trailing edge says the row continues */
    @media (max-width: 380px) { .repository-toolbar { mask-image: linear-gradient(to left, transparent, black 24px); } }
</style>
