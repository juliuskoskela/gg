<script lang="ts">
    import { enabled as neovimDemoEnabled } from "virtual:gg-neovim";
    import NeovimEditor from "../editor/NeovimEditor.svelte";
    import { repositoryScope } from "../workspace/repository";
    import { onDestroy, tick } from "svelte";
    import { revisionIdentity, loadRevisionDiff, type RevisionDetail } from "./data";
    import type { Query } from "../events";
    import type { RevChange } from "../messages/RevChange";
    import { changeSelectEvent, revisionReviewState, repoConfigEvent, fileScrollPositions } from "../stores";
    import DiffViewer from "../DiffViewer.svelte";
    import ChangeObject from "../objects/ChangeObject.svelte";
    import HunkObject from "../objects/HunkObject.svelte";
    import DiffDisplayOptions from "./DiffDisplayOptions.svelte";
    import Icon from "../controls/Icon.svelte";
    import { navigateOptions } from "../controls/optionNavigation";

    export let focused = false;
    export let revs: RevisionDetail;
    export let changes: RevChange[];
    let width = 1200;
    let readerMode: "diff" | "file" = "diff";
    let editorStarted = false;
    export let selectedPath = "";
    export let onSelectFile: (change: RevChange) => void = change => changeSelectEvent.set(change);
    export let onRequestFiles: () => void = () => {};
    let readingKey = "";
    let scrollTop = 0;
    let scrollElement: HTMLDivElement;
    let loaded: Query<RevChange | null> = { type: "wait" };
    let loadGeneration = 0;
    $: repository = repositoryScope($repoConfigEvent);
    $: key = revisionIdentity(revs, repository);
    $: currentChange = selectedPath ? changes.find(change => change.path.repo_path === selectedPath) : changes[0];
    $: loadFile(revs, currentChange, repository);
    async function loadFile(detail: RevisionDetail, file: RevChange | undefined, repo: string) {
        let generation = ++loadGeneration;
        loaded = { type: "wait" };
        if (!file) { loaded = { type: "data", value: null }; return; }
        let result = await loadRevisionDiff(detail, file, repo);
        if (generation !== loadGeneration) return;
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
    $: insertions = revs.changes.reduce((total, change) => total + change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("+")).length, 0), 0);
    $: deletions = revs.changes.reduce((total, change) => total + change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("-")).length, 0), 0);

    function selectFile(change: RevChange) { onSelectFile(change); }
    onDestroy(() => {
        if (readingKey) fileScrollPositions.set(readingKey, scrollTop);
        revisionReviewState.set(key, { path: selectedPath, scrollTop });
    });
</script>

<div class="changes-module" bind:clientWidth={width}>
    {#if !focused}<div class="changes-heading"><h3>Changes <span>{changes.length} {changes.length === 1 ? "file" : "files"}</span></h3><span class="diff-stat">{#if insertions}<span class="added">+{insertions}</span>{/if}{#if deletions}<span class="removed">−{deletions}</span>{/if}</span></div>{/if}
    {#if changes.length}
        <div class="changes-layout">
            <div class="file-review">
                <div class="diff-toolbar">
                    <div class="file-path">{#if currentChange}<ChangeObject compactPath={width < 620} change={currentChange} headers={revs.headers} selected={false} onSelected={onRequestFiles} />{/if}</div>
                    <div class="file-navigation"><button type="button" aria-label="Previous changed file" disabled={selectedIndex <= 0} on:click={() => selectFile(changes[selectedIndex - 1])}><Icon name="chevron-up" /></button><button type="button" aria-label="Next changed file" disabled={selectedIndex >= changes.length - 1} on:click={() => selectFile(changes[selectedIndex + 1])}><Icon name="chevron-down" /></button></div>
                    {#if neovimDemoEnabled}
                        <div class="reader-modes" role="group" aria-label="File presentation"><button type="button" aria-pressed={readerMode === "diff"} on:click={() => readerMode = "diff"}>Diff</button><button type="button" aria-pressed={readerMode === "file"} on:click={() => { editorStarted = true; readerMode = "file"; }}>File</button></div>
                    {/if}
                    {#if readerMode === "diff"}<DiffDisplayOptions compact={width < 620} />{/if}
                </div>
                {#if neovimDemoEnabled && editorStarted && currentChange && $repoConfigEvent.type === "Workspace"}
                    <NeovimEditor repository={$repoConfigEvent.absolute_path} commit={revs.set.to.commit.hex} path={currentChange.path.repo_path} visible={readerMode === "file"} />
                {/if}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex (overflow region needs keyboard scrolling) -->
                <div class="diff-scroll" class:reader-hidden={readerMode !== "diff"} role="region" aria-label="File diff" tabindex="0" bind:this={scrollElement} on:scroll={event => { scrollTop = event.currentTarget.scrollTop; if (loaded.type === "data") fileScrollPositions.set(readingKey, scrollTop); }}>
                    {#if !currentChange}<div class="empty-change" role="status"><h3>File no longer available</h3><p>The requested file is not part of this revision.</p><button type="button" on:click={onRequestFiles}>Choose another file</button></div>
                    {:else if loaded.type === "wait"}<p class="diff-message" role="status">Loading {currentChange.path.relative_path}…</p>
                    {:else if loaded.type === "error"}<div class="diff-message" role="alert"><p>Couldn’t load this file: {loaded.message}</p><button type="button" on:click={() => loadFile(revs, currentChange, repository)}>Retry file</button></div>
                    {:else if loaded.value}
                        {#key loaded.value}
                            {#if !loaded.value.has_conflict && loaded.value.hunks.length}
                                <details class="hunk-actions"><summary><Icon name="chevron-right" />Hunk actions <span>{loaded.value.hunks.length}</span></summary><div class="hunk-list" role="listbox" aria-label="File hunks" tabindex="-1" on:keydown={navigateOptions}>{#each loaded.value.hunks as hunk}<HunkObject header={revs.headers.length === 1 ? revs.headers[0] : null} path={currentChange.path} {hunk} />{/each}</div></details>
                            {/if}
                            <DiffViewer change={loaded.value} {readingKey} />
                        {/key}
                    {:else}<p class="diff-message" role="status">This file is no longer available. Choose another file or refresh the revision.</p>{/if}
                </div>
            </div>
        </div>
    {:else}
        <div class="empty-change" role="status"><h3>No file changes</h3><p>This revision is empty. You can describe it, create a child, or select another revision in the graph.</p></div>
    {/if}
</div>

<style>
    .reader-hidden { display: none; }
    .reader-modes { display: flex; padding: 2px; background: var(--ground); border-radius: var(--radius-control); }
    .reader-modes button[aria-pressed="true"] { background: var(--active); color: var(--text-strong); }
    .diff-message { padding: 16px; color: var(--muted); font-size: var(--type-ui); }
    .diff-message button { min-height: 44px; }
    .changes-module { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    .changes-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px var(--pane-inset); min-height: 36px; }
    .changes-heading h3 { margin: 0; font-size: var(--type-ui); font-weight: 500; display: flex; gap: 10px; align-items: baseline; }
    .changes-heading h3 span { font-weight: 400; font-size: var(--type-caption); color: var(--muted); }
    .diff-stat { display: flex; gap: 8px; font-size: var(--type-caption); font-variant-numeric: tabular-nums; }
    .added { color: var(--positive); } .removed { color: var(--negative); }
    .changes-layout { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); flex: 1; min-width: 0; min-height: 0; isolation: isolate; }
    .file-review { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
    .diff-toolbar { display: flex; align-items: center; gap: 4px; padding: 0 8px 4px; min-width: 0; }
    .file-path { flex: 1; min-width: 0; }
    .file-path :global(.layout) { min-height: 32px; padding: 4px; font-size: var(--type-ui); }
    .file-path :global(.layout span) { white-space: nowrap; }
    .file-navigation { display: flex; align-items: center; gap: 2px; }
    .diff-toolbar button { display: inline-flex; align-items: center; justify-content: center; gap: var(--control-gap); padding: 5px var(--control-padding-inline); min-width: 32px; min-height: 32px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); cursor: pointer; }
    .diff-toolbar button:disabled { color: var(--text-disabled); cursor: default; }
    .diff-scroll { flex: 1; overflow: auto; overscroll-behavior: contain; min-width: 0; min-height: 0; pointer-events: auto; scroll-padding-block: 12px; }
    .hunk-actions { margin: 0 12px 4px; pointer-events: auto; }
    .hunk-actions summary { display: flex; align-items: center; gap: var(--control-gap); width: fit-content; padding-inline: var(--control-padding-inline); border-radius: var(--radius-control); font-size: var(--type-ui); color: var(--text); cursor: pointer; min-height: var(--control-height); list-style: none; }
    .hunk-actions summary::-webkit-details-marker { display: none; }
    .hunk-actions[open] summary :global(svg) { transform: rotate(90deg); }
    .hunk-actions summary span { font-size: var(--type-caption); color: var(--muted); font-variant-numeric: tabular-nums; }
    .hunk-list { padding-block: 4px; }
    .empty-change { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
    .empty-change h3 { margin: 0; font-size: var(--type-body); font-weight: 500; }
    .empty-change p { max-width: 340px; margin: 0; font-size: var(--type-ui); line-height: 1.6; color: var(--muted); }
    @media (max-width: 380px) { .diff-toolbar { flex-wrap: wrap; } .file-path { flex-basis: calc(100% - 120px); } }
    @media (hover: hover) { .diff-toolbar button:not(:disabled):hover, .hunk-actions summary:hover { background: var(--hover); color: var(--text); } }
    .diff-toolbar button:not(:disabled):active, .hunk-actions summary:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .file-path :global(.layout) { min-height: 44px; } .diff-toolbar button { min-width: 44px; min-height: 44px; } .hunk-actions summary { min-height: 44px; } }
</style>
