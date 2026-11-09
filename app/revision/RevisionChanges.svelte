<script lang="ts">
    import { diffNotes } from "../annotations/diffNotes";
    import { annotations } from "../annotations/store";
    import ReviewDelta from "../review/ReviewDelta.svelte";
    import type { ReviewComparison, CompareReview } from "../review/comparison";
    import ReviewControl from "../review/ReviewControl.svelte";
    import { untrack } from "svelte";

    import { rangeLineTargets, owningHeaders } from "./origins";
    import RangeHunk from "./RangeHunk.svelte";
    import OriginLink from "./OriginLink.svelte";
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
    import { lineMenu } from "../annotations/store";
    import { targetCommands } from "../annotations/commands";
    import { navigateOptions } from "../controls/optionNavigation";

    let width = $state(1200);
    interface Props {
        comparison?: ReviewComparison | null;
        onCompare?: CompareReview;
        onCloseComparison?: () => void;
        focused?: boolean;
        showTools?: boolean;
        revs: RevisionDetail;
        changes: RevChange[];
        selectedPath?: string;
        onSelectFile?: (change: RevChange) => void;
        onRequestFiles?: (() => void) | null;
    }

    let {
        comparison = undefined,
        onCompare = undefined,
        onCloseComparison = undefined,
        focused = false,
        showTools = true,
        revs,
        changes,
        selectedPath = "",
        onSelectFile = change => changeSelectEvent.set(change),
        onRequestFiles = null
    }: Props = $props();
    let localComparison = $state.raw<ReviewComparison | null>(null);
    let requestedComparison = $derived(comparison === undefined ? localComparison : comparison);
    let activeComparison = $derived(requestedComparison && revs.headers.some(header => header.id.commit.hex === requestedComparison.to.commit.hex) ? requestedComparison : null);
    function compare(from: ReviewComparison["from"], to: ReviewComparison["to"], path: string | null) {
        if (onCompare) onCompare(from, to, path);
        else localComparison = { from, to, path };
    }
    function closeComparison() {
        localComparison = null;
        onCloseComparison?.();
        void tick().then(() => scrollElement?.focus({ preventScroll: true }));
    }
    let readingKey = $state("");
    let scrollTop = $state(0);
    let scrollElement = $state<HTMLDivElement>();
    let loaded: Query<RevChange | null> = $state.raw({ type: "wait" });
    let loadedFullContext = $state(false);
    let actionsLoaded: Query<RevChange | null> = $state.raw({ type: "wait" });
    let loadGeneration = 0;
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
    async function restoreScroll(expected: string, top: number) {
        await tick();
        if (readingKey === expected && scrollElement) scrollElement.scrollTop = top;
    }


    function selectFile(change: RevChange) { onSelectFile(change); }
    function annotateLines(event: MouseEvent, range: { side: "additions" | "deletions"; start: number; end: number }) {
        let file = loaded.type === "data" ? loaded.value : null, header = revs.headers.length === 1 ? revs.headers[0] : null;
        if (file && revs.headers.length > 1) {
            let targets = rangeLineTargets(file, revs.headers, range);
            lineMenu.set({ x: event.clientX, y: event.clientY, heading: null, commands: targetCommands(async () => targets ?? [], "Annotate selected lines…", range.end - range.start + 1 > MAX_LINES ? `Annotate at most ${MAX_LINES} lines` : targets?.length ? null : "Select changed lines whose origins are available") });
            return;
        }
        let count = range.end - range.start + 1;
        let label = count === 1 ? `Annotate line ${range.start}…` : `Annotate lines ${range.start}–${range.end}…`;
        let reason = !header ? "Select one revision to annotate its lines" : count > MAX_LINES ? `Annotate at most ${MAX_LINES} lines` : null;
        lineMenu.set({ x: event.clientX, y: event.clientY, heading: range.side === "deletions" ? "Before the change" : null, commands: targetCommands(async () => {
            if (!header || !file) return [];
            return [{ anchor: await linesAnchor(header, file, range.side, range.start, range.end, loadFullFiles), subject: subjectOf(header) }];
        }, label, reason) });
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
        loadGeneration++;
        if (readingKey) fileScrollPositions.set(readingKey, scrollTop);
        revisionReviewState.set(key, { path: selectedPath, scrollTop });
    });
    let repository = $derived(repositoryScope($repoConfigEvent));
    let key = $derived(revisionIdentity(revs, repository));
    let currentChange = $derived(selectedPath ? changes.find(change => change.path.repo_path === selectedPath) : changes[0]);
    $effect.pre(() => {
        let detail = revs, file = currentChange, scope = repository, fullContext = $diffFullContext;
        untrack(() => loadFile(detail, file, scope, fullContext));
    });
    $effect.pre(() => {
        let selection = [key, selectedPath];
        untrack(() => { localComparison = null; });
    });
    $effect(() => {
        let viewed = activeComparison;
        untrack(() => {
            if (viewed) void tick().then(() => { if (activeComparison === viewed && scrollElement) scrollElement.scrollTop = 0; });
            else void restoreScroll(readingKey, fileScrollPositions.get(readingKey) ?? scrollTop);
        });
    });
    let selectedIndex = $derived(currentChange ? changes.indexOf(currentChange) : -1);
    let nextReadingKey = $derived(`${key}:${currentChange?.path.repo_path ?? ""}`);
    $effect.pre(() => {
        let next = nextReadingKey;
        untrack(() => {
            if (next !== readingKey) {
                if (readingKey) fileScrollPositions.set(readingKey, scrollTop);
                readingKey = next;
                scrollTop = fileScrollPositions.get(readingKey) ?? 0;
                restoreScroll(readingKey, scrollTop);
            }
        });
    });
</script>

<div class="changes-module" bind:clientWidth={width}>
    {#if showTools}
        <PanelHeader className="changes-heading" label="Diff tools">
            <DiffTools {changes} headers={revs.headers} title={focused ? "" : "Changes"} onCompare={compare} />
        </PanelHeader>
    {/if}
    {#if changes.length || activeComparison}
        <div class="changes-layout">
            <div class="file-review">
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (overflow region needs keyboard scrolling) -->
                <div class="diff-scroll" role="region" aria-label="File diff" tabindex="0" bind:this={scrollElement} onscroll={event => { if (!activeComparison) { scrollTop = event.currentTarget.scrollTop; if (loaded.type === "data") fileScrollPositions.set(readingKey, scrollTop); } }}>
                    {#if activeComparison}<ReviewDelta from={activeComparison.from} to={activeComparison.to} path={activeComparison.path} />
                    {:else if !currentChange}<div class="empty-change" role="status"><h3>File no longer available</h3><p>The requested file is not part of this revision.</p>{#if onRequestFiles}<button type="button" onclick={onRequestFiles}>Choose another file</button>{/if}</div>
                    {:else if loaded.type === "wait"}<p class="diff-message" role="status">Loading {currentChange.path.relative_path}…</p>
                    {:else if loaded.type === "error"}<div class="diff-message" role="alert"><p>Couldn’t load this file: {loaded.message}</p><button type="button" onclick={() => loadFile(revs, currentChange, repository, $diffFullContext)}>Retry file</button></div>
                    {:else if loaded.value}
                        {#key loaded.value}
                            {#if actionsLoaded.type === "data" && actionsLoaded.value && !actionsLoaded.value.has_conflict && actionsLoaded.value.hunks.length}
                                <details class="hunk-actions"><summary><span class="hunk-action-label"><Icon name="chevron-right" />Hunk actions <span>{actionsLoaded.value.hunks.length}</span></span><DiffStat {changes} /></summary><div class="hunk-list" role={revs.headers.length > 1 ? "group" : "listbox"} aria-label="File hunks" tabindex="-1" onkeydown={navigateOptions}>{#each actionsLoaded.value.hunks as hunk}{#if revs.headers.length > 1}<RangeHunk {hunk} path={currentChange.path.repo_path} headers={revs.headers} />{:else}<HunkObject header={revs.headers[0]} path={currentChange.path} {hunk} />{/if}{/each}</div></details>
                            {:else}
                                <div class="file-diff-summary"><span>No editable hunks</span><DiffStat {changes} /></div>
                            {/if}
                            <DiffViewer noteMarkers={diffNotes(loaded.value, revs.headers, $annotations)} change={loaded.value} {readingKey} fullContext={loadedFullContext} {loadFullFiles} onLineMenu={annotateLines} />
                        {/key}
                    {:else}<p class="diff-message" role="status">This file is no longer available. Choose another file or refresh the revision.</p>{/if}
                </div>
                <PanelFooter className="diff-footer"><div class="diff-toolbar">
                    {#if activeComparison}<button class="review-back" type="button" onclick={closeComparison}>Back to file diff</button>
                    {:else}
                    {#if currentChange}{@const owners = owningHeaders(currentChange, revs.headers)}{#if owners[0]}<ReviewControl header={owners[0]} path={currentChange.path.repo_path} onCompare={compare} />{/if}{/if}
                    <div class="file-navigation" role="group" aria-label="Changed files"><button type="button" aria-label="Previous changed file" title="Previous file" disabled={selectedIndex <= 0} onclick={() => selectFile(changes[selectedIndex - 1])}><Icon name="chevron-up" /></button><button type="button" aria-label="Next changed file" title="Next file" disabled={selectedIndex >= changes.length - 1} onclick={() => selectFile(changes[selectedIndex + 1])}><Icon name="chevron-down" /></button></div>
                    {#if revs.headers.length > 1 && currentChange?.origin}<OriginLink origin={currentChange.origin} path={currentChange.path.repo_path} />{/if}
                    <div class="file-path">{#if currentChange}<ChangeObject compactPath={width < 620} change={currentChange} headers={revs.headers} selected={false} onSelected={() => onRequestFiles ? onRequestFiles() : currentChange && onSelectFile(currentChange)} />{/if}</div>
                    {/if}
                </div></PanelFooter>
            </div>
        </div>
    {:else}
        <div class="empty-change" role="status"><h3>No file changes</h3><p>This revision is empty. You can describe it, create a child, or select another revision in the graph.</p></div>
    {/if}
</div>

<style>
    .diff-message { padding: 16px; color: var(--muted); font: var(--font-body); }
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
    .diff-toolbar .review-back { width: auto; padding-inline: var(--space-2); font: var(--font-label); white-space: nowrap; }
    .diff-toolbar button:disabled { color: var(--text-disabled); cursor: default; }
    .diff-scroll > :global(.review-delta) { padding-inline: var(--panel-inset); }
    .diff-scroll { flex: 1; overflow: auto; overscroll-behavior: contain; min-width: 0; min-height: 0; pointer-events: auto; scroll-padding-block: 12px; }
    .hunk-actions { margin: 0 12px 4px; pointer-events: auto; }
    .hunk-actions summary { display: flex; align-items: center; justify-content: space-between; gap: var(--panel-gap); width: 100%; padding-inline: var(--control-padding-inline); border-radius: var(--radius-control); font: var(--font-body); color: var(--text); cursor: pointer; min-height: var(--control-height); list-style: none; }
    .hunk-actions summary::-webkit-details-marker { display: none; }
    .hunk-actions[open] summary :global(svg) { transform: rotate(90deg); }
    .hunk-action-label { display: inline-flex; align-items: center; gap: var(--control-gap); }
    .hunk-actions summary .hunk-action-label { color: var(--text); font: var(--font-body); }
    .file-diff-summary { display: flex; justify-content: space-between; align-items: center; gap: var(--panel-gap); padding: 6px var(--control-padding-inline); margin: 0 12px 4px; color: var(--muted); font: var(--font-label); min-height: var(--control-height); }
    .hunk-actions summary span { color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .hunk-list { padding-block: 4px; }
    .empty-change { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
    .empty-change h3 { margin: 0; color: var(--text-strong); font: var(--font-heading); }
    .empty-change p { max-width: 340px; margin: 0; color: var(--muted); font: var(--font-body); }
    @media (hover: hover) { .diff-toolbar button:not(:disabled):hover, .hunk-actions summary:hover { background: var(--hover); color: var(--text); } }
    .diff-toolbar button:not(:disabled):active, .hunk-actions summary:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .file-path :global(.layout) { min-height: 44px; } .diff-toolbar button { min-width: 44px; min-height: 44px; } .hunk-actions summary { min-height: 44px; } }
</style>
