<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import { mutationPending } from "../operations";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import { repositoryCommands, revisionCommands, type Command } from "../commands/registry";
    import type { Operand } from "../messages/Operand";
    import type { RichHint } from "../mutators/BinaryMutator";
    import BinaryMutator from "../mutators/BinaryMutator";
    import { currentMutation, ignoreToggled, currentSource, currentTarget, hasModal, pickedRevisions, repoConfigEvent, repoStatusEvent, selectWorkingCopy, selectionHeaders } from "../stores";
    import { isTauri, trigger } from "../ipc";
    import BookmarkSpan from "../controls/BookmarkSpan.svelte";
    import { dock, type PanelId } from "../workspace/dock";
    import { bottomToolbar, bottomToolFor, type BottomToolId } from "./bottomToolbar";

    interface Props {
        target: boolean;
        refreshing?: boolean;
        onRefresh: () => void;
    }

    let { target, refreshing = false, onRefresh }: Props = $props();
    let remoteName = $state("");

    let dropHint: RichHint | null = $state(null);
    let maybe = $state(false);

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

    onMount(() => {
        let refresh = () => { if (!refreshing) onRefresh(); };
        window.addEventListener("gg:refresh-repository", refresh);
        return () => window.removeEventListener("gg:refresh-repository", refresh);
    });

    async function openPanel(id: PanelId) {
        dock.open(id);
        await tick();
        document.getElementById(`panel-tab-${id}`)?.focus();
    }

    let remotes = $derived($repoConfigEvent.type === "Workspace" ? $repoConfigEvent.git_remotes : []);
    $effect.pre(() => {
        if (!remotes.includes(remoteName)) remoteName = remotes[0] ?? "";
    });
    let remoteOptions = $derived(remotes.length ? remotes.map(value => ({ value })) : [{ value: "", label: "No remote" }]);
    // without a visible selector, fetch and push ask which remote rather than silently using the first
    let chosenRemote = $derived($bottomToolbar.left.includes("remote") || $bottomToolbar.right.includes("remote") || remotes.length === 1 ? remoteName : "");
    let activeHeaders = $derived($pickedRevisions.length > 1 ? $pickedRevisions : $selectionHeaders);
    let repository = $derived(repositoryCommands(chosenRemote, $currentMutation, $mutationPending, $repoConfigEvent, $repoStatusEvent, $ignoreToggled));
    let revision = $derived(revisionCommands(activeHeaders, false, $currentMutation, $mutationPending, $repoStatusEvent, $ignoreToggled));

    function commandFor(id: BottomToolId): Command | undefined {
        if (id === "refresh") {
            let command = repository.find(command => command.id === "repository.refresh");
            return command && refreshing ? { ...command, reason: "Refreshing repository" } : command;
        }
        if (id === "fetch" || id === "push" || id === "undo" || id === "redo" || id === "immutable") {
            return repository.find(command => command.id === `repository.${id}`);
        }
        return revision.find(command => command.id === id);
    }

    $effect.pre(() => {
        let source = $currentSource, current = $currentTarget;
        untrack(() => setDropHint(source, current));
    });
    $effect.pre(() => {
        if (isTauri()) trigger("set_modifier_state", { alt: $ignoreToggled });
    });
</script>

{#snippet renderTool(id: BottomToolId)}
    {@const tool = bottomToolFor(id)}
    {#if id === "remote"}
        <div class="remote-select"><SelectWidget label="Git remote" title={remoteName || "No Git remote configured"} options={remoteOptions} bind:value={remoteName} disabled={!remotes.length}>{#snippet children({ option })}{option.value || "No remote"}{/snippet}</SelectWidget></div>
    {:else if id === "working_copy"}
        <ActionWidget secondary tip={tool.tip} onClick={selectWorkingCopy}><Icon name={tool.icon} /> <span class="action-label">{tool.label}</span></ActionWidget>
    {:else if id === "commands"}
        <ActionWidget secondary tip={tool.tip} onClick={() => window.dispatchEvent(new Event("gg:open-commands"))}><Icon name={tool.icon} /> <span class="action-label">{tool.label}</span></ActionWidget>
    {:else if id === "terminal" || id === "annotations" || id === "history"}
        <ActionWidget secondary tip={tool.tip} onClick={() => void openPanel(id)}><Icon name={tool.icon} /> <span class="action-label">{tool.label}</span></ActionWidget>
    {:else}
        {@const command = commandFor(id)}
        {@const icon = id === "immutable" && $ignoreToggled ? "shield-off" : tool.icon}
        {@const tip = id === "immutable" ? command?.label ?? tool.tip : tool.tip}
        <ActionWidget secondary {tip} disabled={!command || !!command.reason} disabledReason={command?.reason ?? ""} onClick={() => { if (id === "refresh") { if (!refreshing) onRefresh(); } else void command?.execute(); }}><Icon name={icon} /> <span class="action-label">{tool.label}</span></ActionWidget>
    {/if}
{/snippet}

<div class="repository-toolbar" role="group" aria-label="Repository actions" inert={$hasModal}>
    {#if $bottomToolbar.left.length}
        <div class="sync-actions" role="group" aria-label="Left toolbar tools">
            {#each $bottomToolbar.left as id (id)}
                {@render renderTool(id)}
            {/each}
        </div>
    {/if}
    {#if $bottomToolbar.right.length}
        <div class="history-actions" role="group" aria-label="Right toolbar tools">
            {#each $bottomToolbar.right as id (id)}
                {@render renderTool(id)}
            {/each}
        </div>
    {/if}
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
    .repository-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--tool-group-gap); width: 100%; min-width: 0; pointer-events: auto; }
    .sync-actions, .history-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-row); min-width: 0; }
    .history-actions { margin-inline-start: auto; }
    .remote-select { width: 104px; min-width: 0; }
    .remote-select :global(select) { height: var(--control-height); padding-block: 0; }
    .remote-select :global(.select-trigger) { min-height: 0; height: 100%; padding-block: 0; }
    .repository-toolbar :global(button:not(.select-trigger)) { font: var(--font-body); }
    .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button) { height: var(--control-height); }
    .drag-bar { position: fixed; inset-block-end: calc(var(--repository-footer-height, 40px) + env(safe-area-inset-bottom) + 16px); inset-inline: 16px; margin-inline: auto; width: fit-content; max-width: calc(100% - 32px); padding: 10px 16px; border: var(--line-width) solid var(--line-popover); background: var(--surface); border-radius: var(--radius-surface); box-shadow: var(--shadow-float); z-index: 60; font: var(--font-body); pointer-events: none; }
    .drag-bar.target { color: var(--text); }
    .drag-bar.maybe { color: var(--warning); }
    @media (max-width: 1100px) { .action-label { display: none; } }
    @media (pointer: coarse), (max-width: 600px) {
        .repository-toolbar { gap: var(--space-2); }
        .repository-toolbar :global(button:not(.select-trigger)) { min-height: var(--touch-target); min-width: var(--touch-target); }
        .sync-actions :global(button:not(.select-trigger)), .history-actions :global(button) { height: var(--touch-target); }
        .remote-select { width: 92px; }
        .remote-select :global(select) { height: var(--touch-target); }
    }
    @media (max-width: 350px) {
        .repository-toolbar { gap: var(--space-1) var(--space-3); }
        .history-actions { margin-inline-start: 0; }
    }
</style>
