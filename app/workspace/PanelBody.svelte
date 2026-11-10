<script lang="ts">
    import type { ReviewComparison, CompareReview } from "../review/comparison";
    import PluginPanel from "../plugins/PluginPanel.svelte";
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
    import SelectionReview from "../revision/SelectionReview.svelte";
    import RevisionChanges from "../revision/RevisionChanges.svelte";
    import FilesView from "../files/FilesView.svelte";
    import RevisionOverviewPanel from "../revision/RevisionOverviewPanel.svelte";
    import SelectionRecovery from "../revision/SelectionRecovery.svelte";
    import { repoConfigEvent, repoStatusEvent, pickedRevisions, selectWorkingCopy } from "../stores";
    import { workspaceController } from "./state";
    import { dock, type PanelId } from "./dock";
    import EvolutionPanel from "../history/EvolutionPanel.svelte";
    import OperationHistory from "../history/OperationHistory.svelte";
    import AnnotationsPanel from "../annotations/AnnotationsPanel.svelte";
    import OperationView from "./OperationView.svelte";
    import TerminalView from "../terminal/TerminalView.svelte";
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
    let separate = $derived($pickedRevisions.length > 1 ? $pickedRevisions : detail?.range_unavailable ? detail.headers : []);
    // the files view follows the working copy, so showing its diff means selecting the working copy.
    // the path goes first and again after, because the selection change restores a path it remembers
    function openDiff(change: RevChange) {
        onSelectFile(change);
        selectWorkingCopy();
        workspaceController.setFile(change.path.repo_path);
        dock.focus("diff");
    }
    let file = $derived(selectedPath || changes[0]?.path.repo_path || "");
</script>

{#if id === "diff" && detail && !separate.length && (changes.length || headers.length === 1)}<ViewToolbar label="Diff tools"><DiffTools {changes} {headers} onCompare={compare} placement /></ViewToolbar>{/if}

{#if id.startsWith("plugin:")}
    <PluginPanel {id} />
{:else if id === "terminal"}
    {#key workspace.absolute_path}
        <TerminalView directory={workspace.absolute_path} {active} />
    {/key}
{:else if id === "evolution"}
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
    {#if separate.length}<SelectionReview headers={separate} reason={detail?.range_unavailable ?? "Each selected change is reviewed against its own parents."} />
    {:else if detail}
        <RevisionChanges revs={detail} {changes} {selectedPath} {onSelectFile} focused={true} showTools={false} {comparison} onCompare={compare} onCloseComparison={() => comparison = null} />
    {:else}
        <p class="panel-status" role="status">{selection.type === "wait" ? "Loading revision…" : selection.type === "error" ? selection.message : "This revset matches nothing."}</p>
    {/if}
{:else if id === "tree"}
    <FilesView onOpenDiff={openDiff} />
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
