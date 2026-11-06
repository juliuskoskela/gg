<script lang="ts">
    import { onMount, tick } from "svelte";
    import { get } from "svelte/store";
    import type { Query } from "../events";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RevsResult } from "../messages/RevsResult";
    import type { RevChange } from "../messages/RevChange";
    import { setCommandOperand } from "../commands/context";
    import { revisionIdentity } from "../revision/data";
    import { changeSelectEvent, repoConfigEvent, repoStatusEvent, revisionReviewState } from "../stores";
    import TimelineDisplayOptions from "../timeline/TimelineDisplayOptions.svelte";
    import DiffTools from "../revision/DiffTools.svelte";
    import PanelTabs from "../controls/PanelTabs.svelte";
    import { dock, openPanels, type PanelId } from "./dock";
    import DockFrame from "./DockFrame.svelte";
    import DockDragOverlay from "./DockDragOverlay.svelte";
    import PanelBody from "./PanelBody.svelte";
    import { panelLabel } from "./panels";
    import { repositoryScope } from "./repository";
    import { workspaceController } from "./state";
    import { workspaceViews } from "./views";

    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    export let selection: Query<RevsResult>;
    export let compact: boolean;

    let selectedPath = "";
    let previousKey = "";
    let routedOperation = false;

    $: detail = selection.type === "data" && selection.value.type === "Detail" ? selection.value : null;
    $: changes = detail ? [...detail.changes, ...detail.conflicts.map(conflict => ({ kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] }))].sort((a, b) => a.path.relative_path.localeCompare(b.path.relative_path)) : [];
    $: reviewKey = detail ? revisionIdentity(detail, repositoryScope($repoConfigEvent)) : "";
    $: if (reviewKey !== previousKey) {
        let saved = revisionReviewState.get(reviewKey);
        selectedPath = changes.find(change => change.path.repo_path === (saved?.path ?? selectedPath))?.path.repo_path ?? changes[0]?.path.repo_path ?? "";
        previousKey = reviewKey;
    }
    $: if ($changeSelectEvent && changes.includes($changeSelectEvent) && $changeSelectEvent.path.repo_path !== selectedPath) selectFile($changeSelectEvent);
    $: if (reviewKey) revisionReviewState.set(reviewKey, { path: selectedPath, scrollTop: revisionReviewState.get(reviewKey)?.scrollTop ?? 0 });
    $: requestedPath = $workspaceController.inspector?.activeFilePath ?? null;
    $: if (requestedPath && requestedPath !== selectedPath) selectedPath = requestedPath;
    $: if ($workspaceController.routedTool === "operation") {
        if (!routedOperation) { routedOperation = true; dock.open("operation"); }
    } else routedOperation = false;
    $: panels = openPanels($dock.root);

    function selectFile(change: RevChange) {
        selectedPath = change.path.repo_path;
        if (detail) setCommandOperand({ type: "Change", headers: detail.headers, path: change.path, hunk: null });
        workspaceController.setFile(selectedPath);
        changeSelectEvent.set(change);
    }

    async function reveal(id: PanelId) {
        dock.open(id);
        await tick();
        document.getElementById(`panel-tab-${id}`)?.focus();
    }

    async function closePanel(id: PanelId) {
        let group = document.getElementById(`panel-tab-${id}`)?.closest("[role=tablist]");
        let remaining = [...(group?.querySelectorAll<HTMLElement>("[role=tab]") ?? [])].filter(tab => tab.id !== `panel-tab-${id}`);
        let next = remaining.find(tab => tab.getAttribute("aria-selected") === "true") ?? remaining[0];
        dock.close(id);
        await tick();
        (document.getElementById(next?.id ?? "") ?? document.querySelector<HTMLElement>(".workspace-dock [data-panel-handle]") ?? document.getElementById("views-menu"))?.focus();
    }

    onMount(() => {
        function openView(event: Event) {
            let id = (event as CustomEvent<string>).detail;
            let view = workspaceViews.find(candidate => candidate.id === id);
            if (!view || (view.available && !view.available({ status: get(repoStatusEvent), hasSelection: !!detail }))) return;
            if (view.destination === "history") void reveal("timeline");
            else if (view.destination === "inspect") void reveal("description");
            else if (view.id === "operation") void reveal("operation");
        }
        window.addEventListener("gg:open-view", openView);
        return () => window.removeEventListener("gg:open-view", openView);
    });
</script>

<DockDragOverlay />
<div class="workspace-dock" class:compact>
    {#if !$dock.root}
        <div class="empty-dock">
            <p>No views open.</p>
            <button type="button" on:click={() => window.dispatchEvent(new Event("gg:open-views"))}>Choose a view</button>
        </div>
    {:else if compact}
        <PanelTabs items={panels.map(id => ({ id, label: panelLabel[id], count: id === "tree" ? changes.length : undefined }))} active={$dock.compactActive} onSelect={id => dock.focus(id)} onClose={closePanel} toolsVisible={$dock.compactActive === "timeline" || ($dock.compactActive === "diff" && !!detail)}>
            <svelte:fragment slot="tools">{#if $dock.compactActive === "timeline"}<TimelineDisplayOptions />{:else if $dock.compactActive === "diff" && detail}<DiffTools {changes} />{/if}</svelte:fragment>
        </PanelTabs>
        {#each panels as id (id)}
            <div class="panel-body" id="panel-{id}" role={panels.length > 1 ? "tabpanel" : "region"} aria-labelledby="panel-tab-{id}" hidden={$dock.compactActive !== id} inert={$dock.compactActive !== id}>
                <PanelBody {id} active={$dock.compactActive === id} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} onSelectFile={selectFile} />
            </div>
        {/each}
    {:else}
        <DockFrame node={$dock.root} {workspace} {selection} {detail} {changes} {selectedPath} {reviewKey} onClose={closePanel} onMove={(id, target, edge) => dock.move(id, target, edge)} onResize={(splitPath, ratio) => dock.resize(splitPath, ratio)} onFocus={id => dock.focus(id)} onSelectFile={selectFile} />
    {/if}
</div>

<style>
    .workspace-dock { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface); }
    .workspace-dock > :global(.split), .workspace-dock > :global(.tabs) { flex: 1; }
    .empty-dock { display: grid; align-content: center; justify-items: start; gap: 12px; height: 100%; padding: 24px; }
    .empty-dock p { margin: 0; color: var(--muted); font-size: 13px; }
    .empty-dock button { font-size: 13px; }
    .empty-dock button { min-height: 32px; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-control); background: transparent; color: var(--text); cursor: pointer; }
    .panel-body { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .panel-body[hidden] { display: none; }
    .panel-body > :global(*) { flex: 1; min-height: 0; min-width: 0; }
    @media (hover: hover) { .empty-dock button:hover { background: var(--hover); } }
    @media (pointer: coarse) { .empty-dock button { min-height: 44px; } }
</style>
