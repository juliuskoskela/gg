<script lang="ts">
    import { selectionRecovery } from "./revision/recovery";
    import type { RevisionSelectionResult } from "./messages/RevisionSelectionResult";
    import { loadRevisionSummary, clearRevisionDiffCache, revisionIdentity } from "./revision/data";
    import { setCommandOperand, setDestinationCandidates, refreshCurrentWorkspaceIdentity } from "./commands/context";
    import { executeOperandCommand } from "./commands/registry";
    import OperationFeedback from "./shell/OperationFeedback.svelte";
    import { autoHideScrollbars } from "./scrollbars";
    import { repositoryScope } from "./workspace/repository";
    import { descriptionDrafts } from "./stores";
    import { workspaceController } from "./workspace/state";
    import { get } from "svelte/store";
    import type { RevSet } from "./messages/RevSet";
    import type { RevsResult } from "./messages/RevsResult";
    import type { RepoConfig } from "./messages/RepoConfig";
    import type { RepoStatus } from "./messages/RepoStatus";
    import { type Query, query, mutate, trigger, onEvent, isTauri, getInput } from "./ipc.js";
    import {
        currentMutation,
        currentContext,
        repoConfigEvent,
        repoStatusEvent,
        revisionSelectEvent,
        selectionHeaders,
        currentInput,
        hasMenu,
        progressEvent,
        lastFocus,
        ignoreToggled,
    } from "./stores.js";
    import ContextMenu from "./controls/ContextMenu.svelte";
    import Pane from "./shell/Pane.svelte";
    import TitlebarInset from "./shell/TitlebarInset.svelte";
    import Zone from "./objects/Zone.svelte";
    import WorkspaceChrome from "./shell/WorkspaceChrome.svelte";
    import ActionWidget from "./controls/ActionWidget.svelte";
    import ModalOverlay from "./shell/ModalOverlay.svelte";
    import ErrorDialog from "./shell/ErrorDialog.svelte";
    import ProgressDialog from "./shell/ProgressDialog.svelte";
    import RecentWorkspaces from "./shell/RecentWorkspaces.svelte";
    import { onMount, setContext } from "svelte";
    import InputDialog from "./shell/InputDialog.svelte";
    import type Settings from "./shell/Settings";
    import type { RepoEvent } from "./messages/RepoEvent";
    import RepositoryMutator from "./mutators/RepositoryMutator";

    interface $$Slots {
        default: {
            workspace: Extract<RepoConfig, { type: "Workspace" }>;
            selection: Query<RevsResult>;
        };
    }

    export let revsetOverride: string | null = null;
    export let revsetFromOverride: string | null = null;

    let selection: Query<RevsResult> = {
        type: "wait",
    };
    // for open recent workspaces when error dialogs happen
    let recentWorkspaces: string[] = [];

    if (isTauri()) {
        document.addEventListener("keydown", (event) => {
            const key = event.key.toLowerCase();
            // webviews don't pass these to the native menu, and webview2 would reload on f5
            if (((key === "n" || key === "m" || key === "o") && event.ctrlKey) || key === "f5") {
                event.preventDefault();
                trigger("forward_accelerator", {
                    key,
                    ctrl: event.ctrlKey,
                    shift: event.shiftKey,
                });
            }
        });
    }

    document.body.addEventListener("click", () => currentContext.set(null), true);

    let workspacePath = "";
    async function initialize(path?: string) {
        let result = await query<RepoConfig>("query_workspace", path ? { path } : null);
        if ($repoConfigEvent.type === "TimeoutError") {
            return; // too late! we're dead!
        } else if (result.type === "data") {
            repoConfigEvent.set(result.value);
        } else {
            repoConfigEvent.set({
                type: "LoadError",
                absolute_path: "",
                message: result.message,
            });
        }
    }
    initialize();

    let loadTimeout: number | null;
    onMount(() => {
        if ($repoConfigEvent.type == "Initial") {
            loadTimeout = setTimeout(() => {
                repoConfigEvent.set({ type: "TimeoutError" });
            }, 10_000);
        }

        if (!isTauri()) {
            // signal shutdown on unload, cancel if it was a reload
            const handleUnload = () => {
                trigger("begin_shutdown");
            };
            trigger("end_shutdown");
            window.addEventListener("beforeunload", handleUnload);

            // snapshot when focusing the browser or returning to the tab
            document.addEventListener("visibilitychange", handleFocus);
            window.addEventListener("focus", handleFocus);

            // ping the backend; if either component dies, the other can clean up
            const heartbeatInterval = setInterval(async () => {
                trigger("heartbeat", undefined, cleanup);
            }, 30_000);

            const cleanup = () => {
                clearInterval(heartbeatInterval);
                document.removeEventListener("visibilitychange", handleFocus);
                window.removeEventListener("focus", handleFocus);
                window.removeEventListener("beforeunload", handleUnload);
            };
            return cleanup;
        }
    });

    let settings: Settings = {
        markUnpushedBookmarks: true,
    };
    setContext<Settings>("settings", settings);

    if (isTauri()) {
        // web mode: mutations done directly by ContextMenu
        // gui mode: mutations triggered by native context menu
        onEvent("gg://context/revision", dispatchContext);
        onEvent("gg://context/tree", dispatchContext);
        onEvent("gg://context/bookmark", dispatchContext);
        onEvent("gg://context/workspace", dispatchContext);
        onEvent("gg://menu/repo", mutateRepository);
        // gui mode: snapshot when window gains focus
        onEvent("gg://focus", handleFocus);
    }

    $: if ($repoConfigEvent) loadRepo($repoConfigEvent);
    $: if ($repoStatusEvent && revsetOverride && !$revisionSelectEvent) {
        let syntheticId = {
            change: {
                type: "ChangeId" as const,
                hex: revsetOverride,
                prefix: revsetOverride,
                rest: "",
                offset: null,
                is_divergent: false,
            },
            commit: { type: "CommitId" as const, hex: "", prefix: "", rest: "" },
        };
        $revisionSelectEvent = { from: revsetFromOverride ? { ...syntheticId, change: { ...syntheticId.change, hex: revsetFromOverride, prefix: revsetFromOverride } } : syntheticId, to: syntheticId };
    }
    $: if ($repoStatusEvent && $revisionSelectEvent) {
        loadChange($revisionSelectEvent);
    }
    // gui mode: the backend needs the selection for native menu enablement
    $: if (isTauri()) trigger("set_selection", { set: $revisionSelectEvent ?? null });
    $: if (!isTauri()) {
        document.title =
            $repoConfigEvent.type === "Workspace"
                ? "GG+ — " + $repoConfigEvent.absolute_path.split("/").pop()
                : "GG+ — Jujutsu workspace";
    }
    $: if (
        $repoConfigEvent.type === "LoadError" ||
        $repoConfigEvent.type === "TimeoutError" ||
        $repoConfigEvent.type === "WorkerError"
    ) {
        queryRecentWorkspaces();
    }

    $: if ($repoConfigEvent && $repoStatusEvent) refreshCurrentWorkspaceIdentity();

    let latestSelectionRequest = 0;
    let loadedStatus: RepoStatus | undefined;
    async function loadRepo(config: RepoConfig) {
        latestSelectionRequest++;
        clearRevisionDiffCache();
        setCommandOperand(null);
        selectionRecovery.set(null);
        setDestinationCandidates([]);
        selectionHeaders.set([]);
        if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
        }

        $revisionSelectEvent = undefined;
        if (config.type == "Workspace") {
            settings.markUnpushedBookmarks = config.mark_unpushed_bookmarks;
            ignoreToggled.set(config.ignore_immutable);
            $repoStatusEvent = config.status;
        }
    }

    async function loadChange(set: RevSet) {
        let status = $repoStatusEvent;
        let sameSelection = selection.type === "data" && selection.value.type === "Detail"
            && selection.value.set.from.commit.hex === set.from.commit.hex
            && selection.value.set.to.commit.hex === set.to.commit.hex;
        if (sameSelection && loadedStatus === status) return;
        let request = ++latestSelectionRequest;
        if (!sameSelection) selection = { type: "wait" };
        selectionHeaders.set([]);
        selectionRecovery.set(null);
        if (sameSelection && get(workspaceController).inspector) {
            let endpoints = set.from.commit.hex === set.to.commit.hex ? ["to" as const] : ["from" as const, "to" as const];
            let resolved = { ...set };
            for (let endpoint of endpoints) {
                let result = await query<RevisionSelectionResult>("resolve_revision_selection", { id: set[endpoint] });
                if (request !== latestSelectionRequest) return;
                if (result.type === "error") { selection = result; return; }
                let { candidates, exact } = result.value;
                let stillCurrent = candidates.some(header => header.id.commit.hex === set[endpoint].commit.hex);
                if (!stillCurrent && candidates.length === 1) resolved[endpoint] = candidates[0].id;
                else if (!stillCurrent && candidates.length > 1) {
                    let message = "This change now has multiple revisions. Choose the exact revision to inspect.";
                    selectionRecovery.set({ message, candidates, set, endpoint });
                    selection = { type: "error", message };
                    return;
                } else if (!exact && !candidates.length) {
                    selection = { type: "data", value: { type: "NotFound", set } };
                    return;
                }
            }
            if (endpoints.length === 1) resolved.from = resolved.to;
            set = resolved;
        }
        let rev = await loadRevisionSummary(set);
        if (request !== latestSelectionRequest) return;

        // if empty, fall back to working copy
        if (
            !get(workspaceController).inspector &&
            rev.type == "data" &&
            rev.value.type == "NotFound" &&
            (set.from.commit.hex !== $repoStatusEvent?.working_copy?.hex ||
                set.to.commit.hex !== $repoStatusEvent?.working_copy?.hex)
        ) {
            const workingCopyId = {
                change: {
                    type: "ChangeId" as const,
                    hex: "@",
                    prefix: "@",
                    rest: "",
                    offset: null,
                    is_divergent: false,
                },
                commit: $repoStatusEvent!.working_copy,
            };
            return loadChange({ from: workingCopyId, to: workingCopyId });
        }

        if (sameSelection && selection.type === "data" && selection.value.type === "Detail" && rev.type === "data" && rev.value.type === "Detail" && !rev.value.headers.some(header => header.id.change.is_divergent)) {
            let scope = repositoryScope($repoConfigEvent);
            let previousKey = revisionIdentity(selection.value, scope), nextKey = revisionIdentity(rev.value, scope);
            let draft = get(descriptionDrafts)[previousKey];
            if (previousKey !== nextKey && draft !== undefined) descriptionDrafts.update(drafts => ({ ...drafts, [nextKey]: draft }));
        }
        selection = rev;
        loadedStatus = status;
        if (rev.type == "data" && rev.value.type == "Detail") {
            $selectionHeaders = rev.value.headers;
            if ($revisionSelectEvent?.from.commit.hex !== rev.value.set.from.commit.hex || $revisionSelectEvent?.to.commit.hex !== rev.value.set.to.commit.hex) revisionSelectEvent.set(rev.value.set);
            workspaceController.reconcileSelection(rev.value.set, [...rev.value.changes.map(change => change.path.repo_path), ...rev.value.conflicts.map(conflict => conflict.path.repo_path)]);
        }
    }

    async function handleFocus() {
        if (!isTauri() && document.visibilityState !== "visible") {
            return;
        }
        if ($repoConfigEvent.type === "Workspace") {
            let config = $repoConfigEvent;
            let result = await query<RepoStatus | null>("query_snapshot", null);
            if (result.type === "data" && !result.value) result = await query<RepoStatus>("query_current_status", null);
            if (config !== $repoConfigEvent) return;
            if (result.type === "data" && result.value) {
                repoStatusEvent.set(result.value);
            }
        }
        lastFocus.set(Date.now());
    }

    async function queryRecentWorkspaces() {
        const result = await query<string[]>("query_recent_workspaces", null);
        recentWorkspaces = result.type === "data" ? result.value : [];
    }

    function dispatchContext(event: string) {
        executeOperandCommand($currentContext, event);
        $currentContext = null;
    }

    function mutateRepository(event: RepoEvent) {
        new RepositoryMutator().handle(event);
    }
</script>

<OperationFeedback />

<Zone operand={{ type: "Repository" }} alwaysTarget let:target>
    <div id="shell" use:autoHideScrollbars class={$repoConfigEvent?.type == "Workspace" ? $repoConfigEvent.theme_override : ""}>
        {#if $repoConfigEvent.type == "Initial"}
            <TitlebarInset>
                <Pane>
                    <h2 slot="header">Loading…</h2>
                </Pane>
            </TitlebarInset>
        {:else if $repoConfigEvent.type == "Workspace"}
            <WorkspaceChrome workspace={$repoConfigEvent} {target}>
                <slot workspace={$repoConfigEvent} {selection} />
            </WorkspaceChrome>
        {:else if $repoConfigEvent.type == "LoadError"}
            <ModalOverlay>
                <ErrorDialog title="No workspace loaded">
                    <p>Open a Jujutsu repository to start working in GG+.</p>
                    <p class="workspace-error">{$repoConfigEvent.message}</p>
                    <label for="workspace-path">Repository path</label>
                    <input id="workspace-path" bind:value={workspacePath} placeholder="/path/to/repository" on:keydown={(event) => { if (event.key === "Enter" && workspacePath.trim()) initialize(workspacePath.trim()); }} />
                    <ActionWidget safe primary disabled={!workspacePath.trim()} onClick={() => initialize(workspacePath.trim())}>Open workspace</ActionWidget>
                    <RecentWorkspaces workspaces={recentWorkspaces} />
                </ErrorDialog>
            </ModalOverlay>
        {:else if $repoConfigEvent.type == "TimeoutError"}
            <ModalOverlay>
                <ErrorDialog title="No workspace loaded" severe>
                    <p>GG+ lost contact with its backend. Restart GG+ to continue.</p>
                    <RecentWorkspaces workspaces={recentWorkspaces} />
                </ErrorDialog>
            </ModalOverlay>
        {:else}
            <ModalOverlay>
                <ErrorDialog title="Lost contact with the backend." severe>
                    <p>{$repoConfigEvent.message}</p>
                    <p>Restart GG+ to continue.</p>
                    <RecentWorkspaces workspaces={recentWorkspaces} />
                </ErrorDialog>
            </ModalOverlay>
        {/if}


        {#if $currentInput}
            <ModalOverlay>
                <InputDialog
                    title={$currentInput.title}
                    detail={$currentInput.detail}
                    fields={$currentInput.fields}
                    on:response={(event) => $currentInput?.callback(event.detail)} />
            </ModalOverlay>
        {:else if $currentMutation}
            <ModalOverlay>
                {#if $currentMutation.type == "wait"}
                    <ProgressDialog progress={$progressEvent} />
                {:else if $currentMutation.type == "data" && ($currentMutation.value.type == "InternalError" || $currentMutation.value.type == "PreconditionError")}
                    <ErrorDialog title="That command failed." onClose={() => ($currentMutation = null)} severe>
                        {#if $currentMutation.value.type == "InternalError"}
                            <p>
                                {#each $currentMutation.value.message.lines as line}
                                    {line}<br />
                                {/each}
                            </p>
                        {:else}
                            <p>{$currentMutation.value.message}</p>
                        {/if}
                    </ErrorDialog>
                {:else if $currentMutation.type == "error"}
                    <ErrorDialog title="Lost contact with the backend." onClose={() => ($currentMutation = null)} severe>
                        <p>{$currentMutation.message}</p>
                    </ErrorDialog>
                {/if}
            </ModalOverlay>
        {/if}

        {#if $currentContext && $hasMenu}
            <ContextMenu
                operand={$currentContext}
                x={$hasMenu.x}
                y={$hasMenu.y}
                onClose={() => {
                    hasMenu.set(null);
                    currentContext.set(null);
                }} />
        {/if}
    </div>
</Zone>

<style>
    #shell {
        width: 100%;
        height: 100vh;
        height: 100dvh;
        font-family: var(--stack-ui);
        font-size: var(--type-ui);
        line-height: 1.45;

        display: grid;
        grid-template-columns: 1fr;
        grid-template-rows: minmax(0, 1fr);

        background: var(--ground);
        color: var(--text);

        user-select: none;
    }

    p {
        pointer-events: auto;
        user-select: text;
    }
</style>
