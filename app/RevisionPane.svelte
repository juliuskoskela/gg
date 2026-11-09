<script lang="ts">
    import { untrack } from "svelte";

    import { repositoryScope } from "./workspace/repository";
    import { setCommandOperand } from "./commands/context";
    import { executeOperandCommand } from "./commands/registry";
    import { revisionIdentity, type RevisionDetail } from "./revision/data";
    import type { RevChange } from "./messages/RevChange";
    import { hasModal, fileTreeWidth, changeSelectEvent, revisionReviewState, repoConfigEvent } from "./stores";
    import ActionWidget from "./controls/ActionWidget.svelte";
    import RevisionFiles from "./revision/RevisionFiles.svelte";
    import RevisionOverviewPanel from "./revision/RevisionOverviewPanel.svelte";
    import { revisionModules } from "./revision/modules";
    import { onEvent } from "./ipc";

    interface Props {
        revs: RevisionDetail;
        integrated?: boolean;
        focused?: boolean;
        requestedPath?: string | null;
        onFileSelected?: (path: string) => void;
    }

    let {
        revs,
        integrated = false,
        focused = false,
        requestedPath = null,
        onFileSelected = () => {}
    }: Props = $props();
    let workspaceWidth = $state(800);
    let resizingFiles = $state(false);
    let selectedModule = $state("changes");
    let selectedPath = $state("");
    let previousKey = $state("");
    onEvent<string>("gg://menu/revision", event => executeOperandCommand(revs.headers.length === 1 ? { type: "Revision", header: revs.headers[0] } : { type: "Revisions", headers: revs.headers }, event));
    function resizeFiles(width: number) {
        fileTreeWidth.set(Math.max(180, Math.min(maxFilesWidth, width)));
    }
    function moveFilesSplitter(event: PointerEvent) {
        if (!resizingFiles) return;
        let container = (event.currentTarget as HTMLElement).parentElement!;
        let bounds = container.getBoundingClientRect();
        resizeFiles(getComputedStyle(container).direction === "rtl" ? event.clientX - bounds.left : bounds.right - event.clientX);
    }
    function filesSplitterKeydown(event: KeyboardEvent) {
        let direction = getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl" ? -1 : 1;
        if (event.key === "ArrowLeft") resizeFiles(filesWidth + 24 * direction);
        else if (event.key === "ArrowRight") resizeFiles(filesWidth - 24 * direction);
        else if (event.key === "Home") resizeFiles(180);
        else if (event.key === "End") resizeFiles(maxFilesWidth);
        else return;
        event.preventDefault();
    }
    function selectFile(change: RevChange) {
        selectedPath = change.path.repo_path;
        setCommandOperand({ type: "Change", headers: revs.headers, path: change.path, hunk: null });
        onFileSelected(selectedPath);
        changeSelectEvent.set(change);
    }
    let maxFilesWidth = $derived(Math.max(180, Math.floor(Math.min(workspaceWidth * 0.6, workspaceWidth - 284))));
    let filesWidth = $derived(Math.max(180, Math.min(maxFilesWidth, Number.isFinite($fileTreeWidth) ? $fileTreeWidth : 200)));
    let syntheticChanges = $derived([...revs.changes, ...revs.conflicts.map(conflict => ({ kind: "None" as const, path: conflict.path, has_conflict: true, hunks: [conflict.hunk] }))].sort((a, b) => a.path.relative_path.localeCompare(b.path.relative_path)));
    let reviewKey = $derived(revisionIdentity(revs, repositoryScope($repoConfigEvent)));
    $effect.pre(() => {
        let key = reviewKey, files = syntheticChanges, requested = requestedPath;
        untrack(() => {
            if (key !== previousKey) {
                let saved = revisionReviewState.get(key);
                selectedPath = requested || files.find(change => change.path.repo_path === (saved?.path ?? selectedPath))?.path.repo_path || files[0]?.path.repo_path || "";
                previousKey = key;
            }
        });
    });
    $effect.pre(() => {
        let path = requestedPath;
        untrack(() => { if (path && path !== selectedPath) selectedPath = path; });
    });
    $effect.pre(() => {
        let change = $changeSelectEvent, files = syntheticChanges, path = selectedPath;
        if (change && files.includes(change) && change.path.repo_path !== path) untrack(() => selectFile(change));
    });
    $effect.pre(() => {
        if (reviewKey) revisionReviewState.set(reviewKey, { path: selectedPath, scrollTop: revisionReviewState.get(reviewKey)?.scrollTop ?? 0 });
    });
    let context = $derived({ revs, focused, changes: syntheticChanges, selectedPath, onSelectFile: selectFile });
    let modules = $derived($revisionModules.filter(module => !module.available || module.available(context)));
    let activeModule = $derived(modules.find(module => module.id === selectedModule) ?? modules[0]);
</script>

<section class="revision-pane" class:integrated inert={$hasModal} aria-label="Selected revision">
    <div class="revision-workspace with-files" bind:clientWidth={workspaceWidth} style="--files-width: {filesWidth}px;">
        <div class="revision-content">
            <RevisionOverviewPanel {revs} />
            <div class="revision-main">
                {#if modules.length > 1}<nav class="module-tabs" aria-label="Revision views">{#each modules as module}<button class="selection-item" type="button" aria-current={module.id === activeModule?.id ? "page" : undefined} onclick={() => selectedModule = module.id}>{module.label}</button>{/each}</nav>{/if}
                {#if activeModule}<svelte:boundary><activeModule.component {...context} />{#snippet failed(_error, reset)}<div class="module-error" role="alert"><p>Couldn’t display {activeModule.label.toLowerCase()}.</p><ActionWidget secondary tip="Retry revision view" onClick={reset}>Try again</ActionWidget></div>{/snippet}</svelte:boundary>{/if}
            </div>

        </div>
        <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role (the focusable separator follows the window splitter pattern) -->
        <button type="button" class="files-separator" class:dragging={resizingFiles} role="separator" aria-label="Resize changed files" aria-controls="changed-files" aria-orientation="vertical" aria-valuenow={Math.round(filesWidth)} aria-valuemin={180} aria-valuemax={maxFilesWidth}
            onpointerdown={event => { event.preventDefault(); resizingFiles = true; event.currentTarget.setPointerCapture(event.pointerId); }}
            onpointermove={moveFilesSplitter} onpointerup={() => resizingFiles = false} onpointercancel={() => resizingFiles = false} onlostpointercapture={() => resizingFiles = false} onkeydown={filesSplitterKeydown}></button>
        <RevisionFiles changes={syntheticChanges} headers={revs.headers} {selectedPath} {reviewKey} visible={true} overlay={false} onSelect={selectFile} onClose={null} />
    </div>
</section>

<style>
    .revision-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
    .revision-workspace { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
    .revision-workspace.with-files { grid-template-columns: minmax(0, 1fr) 4px var(--files-width); }
    .files-separator { position: relative; width: 4px; margin: 0; border: 0; padding: 0; background: transparent; cursor: col-resize; touch-action: none; user-select: none; }
    .files-separator::before { content: ""; position: absolute; inset-block: 0; inset-inline: -5px; }
    .files-separator::after { content: ""; position: absolute; inset-block: 0; inset-inline-start: 1px; width: 1px; background: var(--rule); pointer-events: none; }
    .files-separator:focus-visible { outline: none; }
    .files-separator.dragging, .files-separator:focus-visible { background: var(--accent-subtle); }
    .files-separator.dragging::after, .files-separator:focus-visible::after { background: var(--accent); }
    @media (hover: hover) { .files-separator:hover { background: var(--hover); } .files-separator:hover::after { background: var(--control-hover); } }
    @media (pointer: coarse) { .files-separator::before { inset-inline: -10px; } }
    .revision-content { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
    .revision-main { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
    .module-tabs { display: flex; flex-shrink: 0; gap: 4px; overflow-x: auto; overscroll-behavior: contain; padding: 6px var(--pane-inset); border-block-end: 1px solid var(--rule); }
    .module-tabs button { padding: 5px 10px; min-height: 32px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); font-size: 13px; cursor: pointer; white-space: nowrap; }
    .module-error { padding: 24px; display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted); }

</style>
