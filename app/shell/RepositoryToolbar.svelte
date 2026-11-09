<script lang="ts">
    import { onMount, tick } from "svelte";
    import { mutationPending } from "../operations";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import ContextMenu from "../controls/ContextMenu.svelte";
    import type { Command } from "../commands/registry";
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
    let moreOpen = false;
    let moreX = 0;
    let moreY = 0;
    let moreButton: HTMLButtonElement;
    $: overflowCommands = repositoryCommands(remoteName, $currentMutation, $mutationPending, $repoConfigEvent, $repoStatusEvent, $ignoreToggled)
        .filter(command => !["repository.fetch", "repository.push", "repository.undo", "repository.redo"].includes(command.id))
        .map(command => command.id === "repository.refresh" ? { ...command, reason: refreshing ? "Refreshing repository" : command.reason } : command);
    $: moreCommands = [...overflowCommands, {
        id: "repository.commands", label: "Commands…", icon: "command", scope: "Repository", group: 1, reason: null,
        execute: async () => { moreOpen = false; await tick(); moreButton.focus(); window.dispatchEvent(new Event("gg:open-commands")); },
    } satisfies Command];
    function toggleMore() {
        if (moreOpen) { moreOpen = false; return; }
        let bounds = moreButton.getBoundingClientRect();
        moreX = bounds.right;
        moreY = bounds.top;
        moreOpen = true;
    }
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
        <div class="remote-select"><SelectWidget label="Git remote" title={remoteName || "No remote"} options={remoteOptions} bind:value={remoteName} disabled={!remotes.length}>{#snippet children({ option })}{option.value || "No remote"}{/snippet}</SelectWidget></div>
    </div>
    <div class="history-actions" role="group" aria-label="Operation history">
        <ActionWidget secondary tip="Undo the latest operation" disabled={busy} onClick={onUndo}><Icon name="rotate-ccw" /> <span class="action-label">Undo</span></ActionWidget>
        <ActionWidget secondary tip="Redo the latest undone operation" disabled={!!redoReason} disabledReason={redoReason} onClick={onRedo}><Icon name="rotate-cw" /> <span class="action-label">Redo</span></ActionWidget>
    </div>
    <button class="more-button" type="button" aria-label="More repository actions" title="More repository actions" aria-haspopup="menu" aria-expanded={moreOpen} bind:this={moreButton} on:click|stopPropagation={toggleMore} on:keydown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); if (!moreOpen) toggleMore(); } }}><Icon name="more-horizontal" /></button>
</div>

{#if moreOpen}<ContextMenu items={moreCommands} views={false} heading="Repository actions" placement="above-end" x={moreX} y={moreY} onClose={() => moreOpen = false} />{/if}

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
    .repository-toolbar { display: flex; align-items: center; gap: var(--tool-group-gap); width: 100%; min-width: 0; pointer-events: auto; }
    .sync-actions, .history-actions { display: flex; align-items: center; gap: 2px; min-width: 0; }
    .history-actions { margin-inline-start: auto; }
    .remote-select { width: 104px; min-width: 0; margin-inline-start: 4px; }
    .remote-select :global(select) { height: var(--control-height); padding-block: 0; }
    .remote-select :global(.select-trigger) { min-height: 0; height: 100%; padding-block: 0; }
    .repository-toolbar :global(button:not(.select-trigger)) { font: var(--font-body); }
    .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .more-button { height: var(--control-height); }
    .more-button { display: grid; place-items: center; flex: none; width: var(--control-height); min-width: 28px; min-height: 28px; padding: 4px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); cursor: pointer; }
    .more-button[aria-expanded="true"] { background: var(--interaction-selected); }
    @media (hover: hover) { .more-button:hover { background: var(--hover); } }
    .more-button:active { background: var(--control-pressed); }
    .drag-bar { position: fixed; inset-block-end: calc(var(--repository-footer-height, 40px) + env(safe-area-inset-bottom) + 16px); inset-inline: 16px; margin-inline: auto; width: fit-content; max-width: calc(100% - 32px); padding: 10px 16px; border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius-surface); box-shadow: var(--shadow-float); z-index: 60; font: var(--font-body); pointer-events: none; }
    .drag-bar.target { color: var(--text); }
    .drag-bar.maybe { color: var(--warning); }
    @media (max-width: 1100px) { .action-label { display: none; } }
    @media (pointer: coarse), (max-width: 600px) {
        .repository-toolbar { gap: 8px; }
        .repository-toolbar :global(button:not(.select-trigger)) { min-height: 44px; min-width: 44px; }
        .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button), .more-button { height: 44px; }
        .remote-select { width: 92px; }
        .remote-select :global(select) { height: 44px; }
    }
    @media (max-width: 350px) {
        .repository-toolbar { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
        .sync-actions { grid-column: 1 / -1; }
        .history-actions { margin-inline-start: 0; }
    }
</style>
