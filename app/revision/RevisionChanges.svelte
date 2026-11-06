<script lang="ts">
    import { repositoryScope } from "../workspace/repository";
    import { onDestroy, tick } from "svelte";
    import { revisionIdentity, loadRevisionDiff, type RevisionDetail } from "./data";
    import type { Query } from "../events";
    import type { RevChange } from "../messages/RevChange";
    import { changeSelectEvent, revisionReviewState, repoConfigEvent, fileScrollPositions, diffFullContext } from "../stores";
    import DiffViewer from "../DiffViewer.svelte";
    import ChangeObject from "../objects/ChangeObject.svelte";
    import HunkObject from "../objects/HunkObject.svelte";
    import PanelFooter from "../controls/PanelFooter.svelte";
    import PanelHeader from "../controls/PanelHeader.svelte";
    import DiffStat from "./DiffStat.svelte";
    import DiffTools from "./DiffTools.svelte";
    import Icon from "../controls/Icon.svelte";
    import { linesAnchor, MAX_LINES, subjectOf } from "../annotations/anchors";
    import { lineMenu, openComposer } from "../annotations/store";
    import { navigateOptions } from "../controls/optionNavigation";

    export let focused = false;
    export let showTools = true;
    export let revs: RevisionDetail;
    export let changes: RevChange[];
    let width = 1200;
    export let selectedPath = "";
    export let onSelectFile: (change: RevChange) => void = change => changeSelectEvent.set(change);
    export let onRequestFiles: (() => void) | null = null;
    let readingKey = "";
    let scrollTop = 0;
    let scrollElement: HTMLDivElement;
    let loaded: Query<RevChange | null> = { type: "wait" };
    let loadedFullContext = false;
    let actionsLoaded: Query<RevChange | null> = { type: "wait" };
    let loadGeneration = 0;
    $: repository = repositoryScope($repoConfigEvent);
    $: key = revisionIdentity(revs, repository);
    $: currentChange = selectedPath ? changes.find(change => change.path.repo_path === selectedPath) : changes[0];
    $: loadFile(revs, currentChange, repository, $diffFullContext);
    async function loadFile(detail: RevisionDetail, file: RevChange | undefined, repo: string, fullContext: boolean) {
        let generation = ++loadGeneration;
        loaded = { type: "wait" };
        actionsLoaded = { type: "wait" };
        if (!file) { loaded = { type: "data", value: null }; return; }
        let compact = await loadRevisionDiff(detail, file, repo);
        if (generation !== loadGeneration) return;
        actionsLoaded = compact;
        let result = fullContext ? await loadRevisionDiff(detail, file, repo, true) : compact;
        if (generation !== loadGeneration) return;
        loadedFullContext = fullContext;
        loaded = result;
        await tick();
        if (generation === loadGeneration) restoreScroll(readingKey, fileScrollPositions.get(readingKey) ?? 0);
    }
    $: selectedIndex = currentChange ? changes.indexOf(currentChange) : -1;
    $: nextReadingKey = `${key}:${currentChange?.path.repo_path ?? ""}`;
    $: if (nextReadingKey !== readingKey) {
        if (readingKey) fileScrollPositions.set(readingKey, scrollTop);
        readingKey = nextReadingKey;
        scrollTop = fileScrollPositions.get(readingKey) ?? 0;
        restoreScroll(readingKey, scrollTop);
    }
    async function restoreScroll(expected: string, top: number) {
        await tick();
        if (readingKey === expected && scrollElement) scrollElement.scrollTop = top;
    }


    function selectFile(change: RevChange) { onSelectFile(change); }
    function annotateLines(event: MouseEvent, range: { side: "additions" | "deletions"; start: number; end: number }) {
        let file = currentChange, header = revs.headers.length === 1 ? revs.headers[0] : null;
        let count = range.end - range.start + 1;
        let label = count === 1 ? `Annotate line ${range.start}…` : `Annotate lines ${range.start}–${range.end}…`;
        let reason = !header ? "Select one revision to annotate its lines" : count > MAX_LINES ? `Annotate at most ${MAX_LINES} lines` : null;
        lineMenu.set({ x: event.clientX, y: event.clientY, heading: range.side === "deletions" ? "Before the change" : null, commands: [{
            id: "annotate-lines", label, icon: "message-square", scope: "Annotation", reason,
            execute: async () => {
                if (!header || !file) return;
                openComposer({ anchor: await linesAnchor(header, file, range.side, range.start, range.end, loadFullFiles), subject: subjectOf(header) });
            },
        }] });
    }
    async function loadFullFiles() {
        let file = currentChange;
        if (!file) throw new Error("No file selected");
        let result = await loadRevisionDiff(revs, file, repository, true);
        if (result.type !== "data" || !result.value) throw new Error(result.type === "error" ? result.message : "File is no longer available");
        // the full-context diff is one hunk spanning the file; each side is its context plus its own edits
        let lines = result.value.hunks.flatMap(hunk => hunk.lines.lines).filter(line => !line.startsWith("\\"));
        let side = (skip: string) => lines.filter(line => !line.startsWith(skip)).map(line => line.slice(1)).join("");
        return { before: side("+"), after: side("-") };
    }
    onDestroy(() => {
        if (readingKey) fileScrollPositions.set(readingKey, scrollTop);
        revisionReviewState.set(key, { path: selectedPath, scrollTop });
    });
</script>

<div class="changes-module" bind:clientWidth={width}>
    {#if showTools}
        <PanelHeader className="changes-heading" label="Diff tools">
            <DiffTools {changes} title={focused ? "" : "Changes"} />
        </PanelHeader>
    {/if}
    {#if changes.length}
        <div class="changes-layout">
            <div class="file-review">
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (overflow region needs keyboard scrolling) -->
                <div class="diff-scroll" role="region" aria-label="File diff" tabindex="0" bind:this={scrollElement} on:scroll={event => { scrollTop = event.currentTarget.scrollTop; if (loaded.type === "data") fileScrollPositions.set(readingKey, scrollTop); }}>
                    {#if !currentChange}<div class="empty-change" role="status"><h3>File no longer available</h3><p>The requested file is not part of this revision.</p>{#if onRequestFiles}<button type="button" on:click={onRequestFiles}>Choose another file</button>{/if}</div>
                    {:else if loaded.type === "wait"}<p class="diff-message" role="status">Loading {currentChange.path.relative_path}…</p>
                    {:else if loaded.type === "error"}<div class="diff-message" role="alert"><p>Couldn’t load this file: {loaded.message}</p><button type="button" on:click={() => loadFile(revs, currentChange, repository, $diffFullContext)}>Retry file</button></div>
                    {:else if loaded.value}
                        {#key loaded.value}
                            {#if actionsLoaded.type === "data" && actionsLoaded.value && !actionsLoaded.value.has_conflict && actionsLoaded.value.hunks.length}
                                <details class="hunk-actions"><summary><span class="hunk-action-label"><Icon name="chevron-right" />Hunk actions <span>{actionsLoaded.value.hunks.length}</span></span><DiffStat {changes} /></summary><div class="hunk-list" role="listbox" aria-label="File hunks" tabindex="-1" on:keydown={navigateOptions}>{#each actionsLoaded.value.hunks as hunk}<HunkObject header={revs.headers.length === 1 ? revs.headers[0] : null} path={currentChange.path} {hunk} />{/each}</div></details>
                            {:else}
                                <div class="file-diff-summary"><span>No editable hunks</span><DiffStat {changes} /></div>
                            {/if}
                            <DiffViewer change={loaded.value} {readingKey} fullContext={loadedFullContext} {loadFullFiles} onLineMenu={annotateLines} />
                        {/key}
                    {:else}<p class="diff-message" role="status">This file is no longer available. Choose another file or refresh the revision.</p>{/if}
                </div>
                <PanelFooter className="diff-footer"><div class="diff-toolbar">
                    <div class="file-navigation" role="group" aria-label="Changed files"><button type="button" aria-label="Previous changed file" title="Previous file" disabled={selectedIndex <= 0} on:click={() => selectFile(changes[selectedIndex - 1])}><Icon name="chevron-up" /></button><button type="button" aria-label="Next changed file" title="Next file" disabled={selectedIndex >= changes.length - 1} on:click={() => selectFile(changes[selectedIndex + 1])}><Icon name="chevron-down" /></button></div>
                    <div class="file-path">{#if currentChange}<ChangeObject compactPath={width < 620} change={currentChange} headers={revs.headers} selected={false} onSelected={() => onRequestFiles ? onRequestFiles() : currentChange && onSelectFile(currentChange)} />{/if}</div>
                </div></PanelFooter>
            </div>
        </div>
    {:else}
        <div class="empty-change" role="status"><h3>No file changes</h3><p>This revision is empty. You can describe it, create a child, or select another revision in the graph.</p></div>
    {/if}
</div>

<style>
    .diff-message { padding: 16px; color: var(--muted); font-size: var(--type-ui); }
    .diff-message button { min-height: 44px; }
    .changes-module { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    .changes-layout { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; min-width: 0; min-height: 0; isolation: isolate; }
    .file-review { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .diff-toolbar { display: flex; align-items: center; gap: 2px; width: 100%; min-width: 0; min-height: var(--control-height); }
    .file-path { flex: 1; min-width: 0; }
    .file-path :global(.layout) { min-height: 32px; padding: 4px; font-size: var(--type-ui); }
    .file-path :global(.layout span) { white-space: nowrap; }
    .file-navigation { display: flex; align-items: center; flex-shrink: 0; }
    .diff-toolbar button { display: inline-flex; align-items: center; justify-content: center; padding: 0; width: 24px; min-height: 28px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 15px; }
    .diff-toolbar button:disabled { color: var(--text-disabled); cursor: default; }
    .diff-scroll { flex: 1; overflow: auto; overscroll-behavior: contain; min-width: 0; min-height: 0; pointer-events: auto; scroll-padding-block: 12px; }
    .hunk-actions { margin: 0 12px 4px; pointer-events: auto; }
    .hunk-actions summary { display: flex; align-items: center; justify-content: space-between; gap: var(--panel-gap); width: 100%; padding-inline: var(--control-padding-inline); border-radius: var(--radius-control); font-size: var(--type-ui); color: var(--text); cursor: pointer; min-height: var(--control-height); list-style: none; }
    .hunk-actions summary::-webkit-details-marker { display: none; }
    .hunk-actions[open] summary :global(svg) { transform: rotate(90deg); }
    .hunk-action-label { display: inline-flex; align-items: center; gap: var(--control-gap); }
    .hunk-actions summary .hunk-action-label { font-size: var(--type-ui); color: var(--text); }
    .file-diff-summary { display: flex; justify-content: space-between; align-items: center; gap: var(--panel-gap); padding: 6px var(--control-padding-inline); margin: 0 12px 4px; color: var(--muted); font-size: var(--type-caption); min-height: var(--control-height); }
    .hunk-actions summary span { font-size: var(--type-caption); color: var(--muted); font-variant-numeric: tabular-nums; }
    .hunk-list { padding-block: 4px; }
    .empty-change { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
    .empty-change h3 { margin: 0; font-size: var(--type-body); font-weight: 500; }
    .empty-change p { max-width: 340px; margin: 0; font-size: var(--type-ui); line-height: 1.6; color: var(--muted); }
    @media (hover: hover) { .diff-toolbar button:not(:disabled):hover, .hunk-actions summary:hover { background: var(--hover); color: var(--text); } }
    .diff-toolbar button:not(:disabled):active, .hunk-actions summary:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .file-path :global(.layout) { min-height: 44px; } .diff-toolbar button { min-width: 44px; min-height: 44px; } .hunk-actions summary { min-height: 44px; } }
</style>
