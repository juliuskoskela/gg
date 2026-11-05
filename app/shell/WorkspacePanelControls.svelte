<script lang="ts">
    import { paneMode, selectWorkingCopy, mobileFilesVisible } from "../stores";
    import PanelToggle from "../controls/PanelToggle.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Icon from "../controls/Icon.svelte";
    import FilesToggle from "./FilesToggle.svelte";
    export let revisionAvailable = true;
    $: historyVisible = $paneMode !== "change";
    $: revisionVisible = $paneMode !== "history";
    $: if (!revisionVisible) mobileFilesVisible.set(false);
    function toggleHistory() {
        paneMode.set(historyVisible ? "change" : "both");
    }
    function toggleRevision() {
        paneMode.set(revisionVisible ? "history" : "both");
    }
</script>

<header class="workspace-panels revision-header" aria-label="Workspace panels">
    <div class="history-controls">
        <PanelToggle label={(historyVisible ? "Hide revision graph" : "Show revision graph")} controls="timeline-panel" expanded={historyVisible} disabled={historyVisible && !revisionVisible} onToggle={toggleHistory} />
        <h2 class="history-label">History</h2>
        <div class="working-copy-control"><ActionWidget secondary tip="Jump to working copy" onClick={selectWorkingCopy}><Icon name="edit-3" /></ActionWidget></div>
    </div>
    <div class="workspace-context"><slot /></div>
    <div class="revision-controls">
        <PanelToggle label={(revisionVisible ? "Hide revision" : "Show revision")} controls="change-panel" side="trailing" expanded={revisionVisible} disabled={revisionVisible && !historyVisible} onToggle={toggleRevision} />
        <FilesToggle disabled={!revisionVisible || !revisionAvailable} />
    </div>
</header>

<style>
    .workspace-panels { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 3px 8px; border-block-end: 1px solid var(--rule); background: var(--surface); min-width: 0; }
    .history-controls, .revision-controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .history-label { color: var(--text); font-size: var(--type-ui); font-weight: 400; margin: 0 8px 0 0; }
    .workspace-context { display: flex; align-items: center; flex: 1; min-width: 0; gap: 12px; }
    .working-copy-control { display: flex; }
    @media (pointer: coarse), (max-width: 600px) { .workspace-panels { min-height: 52px; } }
    @media (max-width: 767px) { .history-label, .working-copy-control { display: none; } .workspace-panels { gap: 8px; } }
</style>
