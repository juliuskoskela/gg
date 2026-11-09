<script lang="ts">
    import type { ReviewComparison, CompareReview } from "../review/comparison";
    import { untrack } from "svelte";
    import { provideToolbarOwner } from "../controls/toolbars";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import DiffTools from "../revision/DiffTools.svelte";
    import { enabled as neovimEnabled } from "virtual:gg-neovim";
    import type { Query } from "../events";
    import type { RepoConfig } from "../messages/RepoConfig";
    import type { RevsResult } from "../messages/RevsResult";
    import type { RevChange } from "../messages/RevChange";
    import LogPane from "../LogPane.svelte";
    import NeovimEditor from "../editor/NeovimEditor.svelte";
    import RevisionTools from "../revision/RevisionTools.svelte";
    import RevisionChanges from "../revision/RevisionChanges.svelte";
    import RevisionFiles from "../revision/RevisionFiles.svelte";
    import RevisionOverviewPanel from "../revision/RevisionOverviewPanel.svelte";
    import SelectionRecovery from "../revision/SelectionRecovery.svelte";
    import { repoConfigEvent, repoStatusEvent } from "../stores";
    import type { PanelId } from "./dock";
    import EvolutionPanel from "../history/EvolutionPanel.svelte";
    import OperationHistory from "../history/OperationHistory.svelte";
    import AnnotationsPanel from "../annotations/AnnotationsPanel.svelte";
    import OperationView from "./OperationView.svelte";
    import SettingsPanel from "../shell/SettingsPanel.svelte";

    interface Props {
        id: PanelId;
        active: boolean;
        workspace: Extract<RepoConfig, { type: "Workspace" }>;
        selection: Query<RevsResult>;
        detail: Extract<RevsResult, { type: "Detail" }> | null;
        changes: RevChange[];
        selectedPath: string;
        reviewKey: string;
        onSelectFile: (change: RevChange) => void;
    }

    let {
        id,
        active,
        workspace,
        selection,
        detail,
        changes,
        selectedPath,
        reviewKey,
        onSelectFile
    }: Props = $props();

    // parents key this component by panel id, so toolbar ownership lasts for its lifetime.
    provideToolbarOwner(untrack(() => id));

    let comparison = $state.raw<ReviewComparison | null>(null);
    let compare: CompareReview = (from, to, path) => { comparison = { from, to, path }; };
    $effect.pre(() => {
        let selection = [reviewKey, selectedPath];
        untrack(() => { comparison = null; });
    });
    let headers = $derived(detail?.headers ?? []);
    let file = $derived(selectedPath || changes[0]?.path.repo_path || "");
</script>

{#if id === "diff" && detail && (changes.length || headers.length === 1)}<ViewToolbar label="Diff tools"><DiffTools {changes} {headers} onCompare={compare} /></ViewToolbar>{/if}

{#if id === "evolution"}
    <EvolutionPanel {headers} {active} />
{:else if id === "history"}
    <OperationHistory {active} />
{:else if id === "annotations"}
    <AnnotationsPanel {active} />
{:else if id === "settings"}
    <SettingsPanel />
{:else if id === "timeline"}
    {#key workspace}
        <LogPane integrated query_choices={workspace.query_choices} latest_query={workspace.latest_query} />
    {/key}
{:else if id === "description"}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the document scrolls independently of the dock) -->
    <div class="description-panel" role="region" aria-label="Revision description" tabindex="0">
        {#if selection.type === "error"}
            <p role="alert">{selection.message}</p>
        {:else if selection.type === "wait"}
            <p role="status">Loading revision…</p>
        {:else if !detail}
            <SelectionRecovery />
            <p>This revset matches nothing.</p>
        {:else}
            <RevisionOverviewPanel revs={detail} />
        {/if}
    </div>
{:else if id === "revision-tools"}
    {#if selection.type === "error"}
        <p class="panel-status" role="alert">{selection.message}</p>
    {:else if selection.type === "wait"}
        <p class="panel-status" role="status">Loading revision…</p>
    {:else}
        <RevisionTools {headers} />
    {/if}
{:else if id === "diff"}
    {#if detail}
        <RevisionChanges revs={detail} {changes} {selectedPath} {onSelectFile} focused={true} showTools={false} {comparison} onCompare={compare} onCloseComparison={() => comparison = null} />
    {:else}
        <p class="panel-status" role="status">{selection.type === "wait" ? "Loading revision…" : selection.type === "error" ? selection.message : "This revset matches nothing."}</p>
    {/if}
{:else if id === "tree"}
    {#if detail}
        <RevisionFiles {changes} {headers} {selectedPath} {reviewKey} visible={true} overlay={false} onSelect={onSelectFile} onClose={null} showHeading={false} />
    {:else}
        <p class="panel-status" role="status">{selection.type === "wait" ? "Loading revision…" : "This revset matches nothing."}</p>
    {/if}
{:else if id === "edit"}
    {#if !neovimEnabled}
        <p class="panel-status" role="status">Edit is unavailable in this build.</p>
    {:else if headers.length !== 1}
        <p class="panel-status" role="status">Edit one revision at a time.</p>
    {:else if !file || $repoConfigEvent.type !== "Workspace"}
        <p class="panel-status" role="status">This revision has no file to edit.</p>
    {:else}
        <NeovimEditor repository={$repoConfigEvent.absolute_path} commit={headers[0].id.commit.hex} path={file} visible={active} />
    {/if}
{:else if id === "operation"}
    <OperationView status={$repoStatusEvent} />
{/if}

<style>
    .description-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scroll-padding-block: 16px; pointer-events: auto; background: var(--surface); }
    .panel-status, .description-panel > p { margin: 0; padding: 16px; color: var(--muted); font-size: 13px; }
</style>
