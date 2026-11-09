<script lang="ts">
    import ReviewLifecycle from "./review/ReviewLifecycle.svelte";
    import { focusModality } from "./display/focus";
    import TextField from "./controls/TextField.svelte";
    import { effectiveTheme, themeFamily, darkDepth, colorVision } from "./display/theme";
    import { selectionRecovery } from "./revision/recovery";
    import type { RevisionSelectionResult } from "./messages/RevisionSelectionResult";
    import { loadRevisionSummary, clearRevisionDiffCache, revisionIdentity } from "./revision/data";
    import { setCommandOperand, setDestinationCandidates, refreshCurrentWorkspaceIdentity } from "./commands/context";
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
    import { lineMenu, loadAnnotations } from "./annotations/store";
    import Pane from "./shell/Pane.svelte";
    import TitlebarInset from "./shell/TitlebarInset.svelte";
    import Zone from "./objects/Zone.svelte";
    import WorkspaceChrome from "./shell/WorkspaceChrome.svelte";
    import ActionWidget from "./controls/ActionWidget.svelte";
    import ModalOverlay from "./shell/ModalOverlay.svelte";
    import ErrorDialog from "./shell/ErrorDialog.svelte";
    import ProgressDialog from "./shell/ProgressDialog.svelte";
    import RecentWorkspaces from "./shell/RecentWorkspaces.svelte";
    import { onMount, onDestroy, setContext, untrack, type Snippet } from "svelte";
    import InputDialog from "./shell/InputDialog.svelte";
    import type Settings from "./shell/Settings";
    import type { RepoEvent } from "./messages/RepoEvent";
    import RepositoryMutator from "./mutators/RepositoryMutator";

    interface Props {
        revsetOverride?: string | null;
        revsetFromOverride?: string | null;
        children?: Snippet<[{ workspace: Extract<RepoConfig, { type: "Workspace" }>; selection: Query<RevsResult> }]>;
    }

    let { revsetOverride = null, revsetFromOverride = null, children: workspaceContent }: Props = $props();

    let selection: Query<RevsResult> = $state.raw({
        type: "wait",
    });
    // for open recent workspaces when error dialogs happen
    let recentWorkspaces: string[] = $state.raw([]);

    onMount(() => {
        function forwardAccelerator(event: KeyboardEvent) {
            let key = event.key.toLowerCase();
            // webviews reserve these shortcuts unless the frontend forwards them.
            if (((key === "n" || key === "m" || key === "o") && event.ctrlKey) || key === "f5") {
                event.preventDefault();
                trigger("forward_accelerator", { key, ctrl: event.ctrlKey, shift: event.shiftKey });
            }
        }
        let clearContext = () => currentContext.set(null);
        if (isTauri()) document.addEventListener("keydown", forwardAccelerator);
        document.body.addEventListener("click", clearContext, true);
        return () => {
            document.removeEventListener("keydown", forwardAccelerator);
            document.body.removeEventListener("click", clearContext, true);
        };
    });

    let workspacePath = $state("");
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

    let settings: Settings = $state({
        markUnpushedBookmarks: true,
    });
    setContext<Settings>("settings", settings);

    if (isTauri()) {
        onEvent("gg://menu/repo", mutateRepository);
        // gui mode: snapshot when window gains focus
        onEvent("gg://focus", handleFocus);
    }



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
                else if (!stillCurrent && candidates.length> 1) {
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

    function mutateRepository(event: RepoEvent) {
        new RepositoryMutator().handle(event);
    }

    function refreshAnnotations() {
        if ($repoConfigEvent.type === "Workspace") loadAnnotations();
    }
    onDestroy(() => { latestSelectionRequest++; if (loadTimeout) clearTimeout(loadTimeout); });
    $effect.pre(() => {
        let config = $repoConfigEvent;
        if (config) untrack(() => loadRepo(config));
    });
    $effect.pre(() => {
        let status = $repoStatusEvent, override = revsetOverride, from = revsetFromOverride;
        untrack(() => {
            if (!status || !override || get(revisionSelectEvent)) return;
            let id = {
                change: { type: "ChangeId" as const, hex: override, prefix: override, rest: "", offset: null, is_divergent: false },
                commit: { type: "CommitId" as const, hex: "", prefix: "", rest: "" },
            };
            revisionSelectEvent.set({ from: from ? { ...id, change: { ...id.change, hex: from, prefix: from } } : id, to: id });
        });
    });
    $effect.pre(() => {
        let status = $repoStatusEvent, set = $revisionSelectEvent;
        if (status && set) untrack(() => loadChange(set));
    });
    // gui mode: the backend needs the selection for native menu enablement.
    $effect(() => {
        let set = $revisionSelectEvent ?? null;
        if (isTauri()) untrack(() => trigger("set_selection", { set }));
    });
    $effect(() => {
        if (!isTauri()) document.title = $repoConfigEvent.type === "Workspace"
            ? "GG+ — " + $repoConfigEvent.absolute_path.split("/").pop()
            : "GG+ — Jujutsu workspace";
    });
    $effect(() => {
        let config = $repoConfigEvent;
        if (config.type === "LoadError" || config.type === "TimeoutError" || config.type === "WorkerError") untrack(queryRecentWorkspaces);
    });
    $effect.pre(() => {
        let config = $repoConfigEvent, status = $repoStatusEvent;
        if (config && status) untrack(refreshCurrentWorkspaceIdentity);
    });
    // notes can change outside the app, e.g. an agent replying from the command line.
    $effect(() => {
        if ($repoConfigEvent.type === "Workspace") untrack(loadAnnotations);
    });
</script>

<OperationFeedback />
<ReviewLifecycle />

<svelte:window onfocus={refreshAnnotations} />

<Zone operand={{ type: "Repository" }} alwaysTarget>
    {#snippet children({ target })}
    <div id="shell" use:focusModality use:autoHideScrollbars class={$effectiveTheme} data-theme-family={$themeFamily} data-dark-depth={$darkDepth} data-color-vision={$colorVision}>
        {#if $repoConfigEvent.type == "Initial"}
            <TitlebarInset>
                <Pane>
                    {#snippet header()}<h2 >Loading…</h2>{/snippet}
                </Pane>
            </TitlebarInset>
        {:else if $repoConfigEvent.type == "Workspace"}
            <WorkspaceChrome workspace={$repoConfigEvent} {target}>
                {@render workspaceContent?.({ workspace: $repoConfigEvent, selection, })}
            </WorkspaceChrome>
        {:else if $repoConfigEvent.type == "LoadError"}
            <ModalOverlay>
                <ErrorDialog title="No workspace loaded">
                    <p>Open a Jujutsu repository to start working in GG+.</p>
                    <p class="workspace-error">{$repoConfigEvent.message}</p>
                    <label for="workspace-path">Repository path</label>
                    <TextField id="workspace-path" bind:value={workspacePath} placeholder="/path/to/repository" onkeydown={(event) => { if (event.key === "Enter" && workspacePath.trim()) initialize(workspacePath.trim()); }} />
                    <ActionWidget safe primary disabled={!workspacePath.trim()} onClick={() => initialize(workspacePath.trim())}>Open workspace</ActionWidget>
                    {#if isTauri()}
                        <ActionWidget safe onClick={() => trigger("forward_accelerator", { key: "o", ctrl: true, shift: false })}>Choose repository…</ActionWidget>
                        <ActionWidget safe onClick={() => trigger("forward_accelerator", { key: "n", ctrl: true, shift: true })}>Initialize repository…</ActionWidget>
                        <ActionWidget safe onClick={() => trigger("forward_accelerator", { key: "o", ctrl: true, shift: true })}>Clone repository…</ActionWidget>
                        <ActionWidget safe onClick={() => trigger("forward_accelerator", { key: "f5", ctrl: false, shift: false })}>Reopen repository</ActionWidget>
                    {/if}
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
                    onResponse={response => $currentInput?.callback(response)} />
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

        {#if $lineMenu}
            <ContextMenu items={$lineMenu.commands} heading={$lineMenu.heading} x={$lineMenu.x} y={$lineMenu.y} onClose={() => lineMenu.set(null)} />
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

    {/snippet}
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
