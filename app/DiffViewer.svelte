<script lang="ts" context="module">
    import { registerCustomCSSVariableTheme } from "@pierre/diffs";

    // keep syntax and diff surfaces on the same theme as the surrounding workspace.
    registerCustomCSSVariableTheme("gg", {});

    let chevron = (path: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${path}'/></svg>`)}")`;
    // collapsed blocks read as one quiet fold row: chevron + count, the whole row is the target.
    // the library's per-direction expand glyphs are replaced because a block always unfolds whole.
    let FOLD_CSS = `
        [data-separator=line-info] [data-separator-wrapper] { cursor: pointer; }
        [data-expand-button] { border-right: 0 !important; background: transparent !important; }
        [data-expand-button] [data-icon] { display: none; }
        [data-expand-button]::before { content: ""; width: 14px; height: 14px; background: currentColor; -webkit-mask: ${chevron("M6 9l6 6 6-6")} center / contain no-repeat; mask: ${chevron("M6 9l6 6 6-6")} center / contain no-repeat; }
        [data-separator-content] { background: transparent !important; padding-inline-start: 0 !important; }
        [data-separator-content]:hover { text-decoration: none; }
        [data-unmodified-lines] { display: flex; align-items: center; align-self: stretch; flex: 1; font-size: var(--type-caption); }
        [data-separator=line-info] [data-separator-wrapper] { transition: color 120ms ease, background-color 120ms ease; }
        [data-separator=line-info] [data-separator-wrapper]:hover { background-color: var(--hover) !important; }
        [data-separator=line-info] [data-separator-wrapper]:hover :is([data-expand-button], [data-separator-content]) { color: var(--text); }
        @media (prefers-reduced-motion: reduce) { [data-separator=line-info] [data-separator-wrapper] { transition: none; } }
    `;
</script>

<script lang="ts">
    import { FileDiff, File, parsePatchFiles, type FileDiffOptions, type FileDiffMetadata, type DiffLineAnnotation } from "@pierre/diffs";
    import { onMount } from "svelte";
    import DiffScrollbars from "./revision/DiffScrollbars.svelte";
    import type { RevChange } from "./messages/RevChange";
    import { changePatch } from "./diff";
    import { diffStyle, diffWrap, fileHorizontalPositions } from "./stores";
    import { effectiveTheme } from "./display/theme";

    export let change: RevChange;
    export let readingKey = "";
    export let themeOverride: "light" | "dark" | undefined = undefined;
    export let fullContext = false;
    // supplies both complete sides so collapsed blocks can be unfolded one at a time
    export let loadFullFiles: (() => Promise<{ before: string; after: string }>) | null = null;
    let renderedKey = "";
    let disconnectColumns = () => {};
    let host: HTMLDivElement;
    let width = 0;
    $: resolvedStyle = $diffStyle === "auto" ? (width >= 720 ? "split" : "unified") : $diffStyle;
    let viewer: FileDiff<number> | File | undefined;
    let error = "";
    let mounted = false;
    let scrollColumns: HTMLElement[] = [];
    // gap index i is the unchanged block before hunk i; hunks.length is the block after the last hunk
    let unfolded = new Set<number>();
    type Expansions = { getExpandedHunksMap(): Map<number, unknown>; renderCache?: { highlighted?: boolean }; clearRenderCache(): void };
    $: options = {
        theme: "gg",
        themeType: themeOverride ?? $effectiveTheme,
        diffStyle: resolvedStyle,
        overflow: $diffWrap ? "wrap" as const : "scroll" as const,
        expandUnchanged: fullContext,
        // one click unfolds the whole block, so never split it into partial chunks
        expansionLineCount: 1_000_000_000,
        loadDiffFiles: loadFullFiles && !fullContext ? loadDiffFiles : undefined,
        renderAnnotation: renderFold,
        lineDiffType: "word-alt" as const,
        enableLineSelection: true,
        disableFileHeader: true,
        onPostRender: connectScrollColumns,
        unsafeCSS: ":host { color-scheme: inherit !important; --diffs-font-family: var(--stack-code); --diffs-font-size: var(--type-code); --diffs-line-height: calc(var(--type-code) * var(--code-leading)); --diffs-bg-context-override: var(--surface); --diffs-bg-buffer-override: var(--diff-buffer); --diffs-bg-separator-override: var(--raised); --diffs-fg-number-override: var(--muted); --diffs-addition-color-override: var(--positive); --diffs-deletion-color-override: var(--negative); --diffs-selection-color-override: var(--selection-bg); --diffs-bg-addition-override: var(--diff-addition); --diffs-bg-addition-emphasis-override: var(--diff-addition-emphasis); --diffs-bg-deletion-override: var(--diff-deletion); --diffs-bg-deletion-emphasis-override: var(--diff-deletion-emphasis); } [data-code] { scrollbar-width: none; } [data-code]::-webkit-scrollbar { height: 0; }" + FOLD_CSS,
    } satisfies FileDiffOptions<number, undefined>;
    async function loadDiffFiles(fileDiff: FileDiffMetadata) {
        let files = await loadFullFiles!();
        return { oldFile: { name: fileDiff.prevName ?? fileDiff.name, contents: files.before }, newFile: { name: fileDiff.name, contents: files.after } };
    }
    function gapAnchors(fileDiff: FileDiffMetadata, gap: number): { additions: number; deletions: number } | null {
        let hunks = fileDiff.hunks;
        if (gap === 0) {
            let first = hunks[0];
            return first && first.additionStart > 1 ? { additions: first.additionStart - 1, deletions: first.deletionStart - 1 } : null;
        }
        let previous = hunks[gap - 1];
        if (!previous) return null;
        return { additions: previous.additionStart + Math.max(previous.additionCount, 1) - 1, deletions: previous.deletionStart + Math.max(previous.deletionCount, 1) - 1 };
    }
    function gapSize(fileDiff: FileDiffMetadata, gap: number) {
        let hunks = fileDiff.hunks;
        if (gap < hunks.length) return hunks[gap].collapsedBefore;
        let last = hunks[hunks.length - 1];
        return last ? Math.max(0, fileDiff.additionLines.length - (last.additionStart + last.additionCount - 1)) : 0;
    }
    function foldAnnotations(fileDiff: FileDiffMetadata): DiffLineAnnotation<number>[] {
        let result: DiffLineAnnotation<number>[] = [];
        for (let gap of [...unfolded].sort((a, b) => a - b)) {
            let anchor = gapAnchors(fileDiff, gap);
            if (!anchor) continue;
            result.push({ side: "additions", lineNumber: anchor.additions, metadata: gap });
            if (resolvedStyle === "split") result.push({ side: "deletions", lineNumber: anchor.deletions, metadata: gap });
        }
        return result;
    }
    function renderFold(annotation: DiffLineAnnotation<number>, fileDiff: FileDiffMetadata) {
        let gap = annotation.metadata;
        if (gap === undefined) return undefined;
        let lines = gapSize(fileDiff, gap);
        let button = document.createElement("button");
        button.type = "button";
        button.className = "diff-fold";
        button.setAttribute("aria-expanded", "true");
        button.title = "Collapse unmodified lines";
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg><span>${lines} unmodified ${lines === 1 ? "line" : "lines"}</span>`;
        // the diff host treats pointer events as line selection
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("click", event => { event.stopPropagation(); fold(gap); });
        return button;
    }
    function expansions() {
        return (viewer as unknown as { hunksRenderer: Expansions }).hunksRenderer;
    }
    function currentDiff() {
        return (viewer as unknown as { getWorkingDiff(): FileDiffMetadata | undefined }).getWorkingDiff();
    }
    function fold(gap: number) {
        if (!(viewer instanceof FileDiff)) return;
        unfolded.delete(gap);
        let renderer = expansions();
        renderer.getExpandedHunksMap().delete(gap);
        if (renderer.renderCache?.highlighted !== true) renderer.clearRenderCache();
        let fileDiff = currentDiff();
        if (fileDiff) viewer.setLineAnnotations(foldAnnotations(fileDiff));
        viewer.rerender();
    }
    function connectScrollColumns(node: HTMLElement) {
        disconnectColumns();
        scrollColumns = Array.from(node.shadowRoot?.querySelectorAll<HTMLElement>('[data-overflow="scroll"] [data-code]:not([data-diffs-scrollbar-measure])') ?? []);
        let columns = scrollColumns;
        let key = renderedKey;
        let saved = fileHorizontalPositions.get(key);
        let cleanup = columns.map((column, i) => {
            if (saved) column.scrollLeft = saved[i] ?? 0;
            let record = () => {
                if (!key) return;
                fileHorizontalPositions.set(key, columns.map(item => item.scrollLeft));
                if (fileHorizontalPositions.size > 100) fileHorizontalPositions.delete(fileHorizontalPositions.keys().next().value!);
            };
            column.addEventListener("scroll", record, { passive: true });
            return () => column.removeEventListener("scroll", record);
        });
        disconnectColumns = () => cleanup.forEach(remove => remove());
    }
    function render() {
        disconnectColumns();
        renderedKey = `${readingKey}:${resolvedStyle}`;
        viewer?.cleanUp();
        host.replaceChildren();
        scrollColumns = [];
        unfolded = new Set();
        error = "";
        try {
            if (change.has_conflict) {
                viewer = new File(options as never);
                viewer.render({ file: { name: change.path.relative_path, contents: change.hunks.flatMap(hunk => hunk.lines.lines.map(line => line.slice(1))).join("") }, containerWrapper: host });
            } else {
                let fileDiff = parsePatchFiles(changePatch(change))[0]?.files[0];
                if (!fileDiff || !change.hunks.length) { error = "No text diff available. This file may be binary or have only metadata changes."; return; }
                // the full-context query includes both complete sides, unlike an ordinary patch.
                if (fullContext) fileDiff.isPartial = false;
                fileDiff.name = change.path.relative_path;
                fileDiff.prevName = undefined;
                let diffViewer = new FileDiff<number>(options);
                let expand = diffViewer.expandHunk;
                // separators always unfold their whole block, and we remember it so it can be folded again
                diffViewer.expandHunk = (gap, _direction, _count) => {
                    unfolded.add(gap);
                    let working = currentDiff();
                    if (working) diffViewer.setLineAnnotations(foldAnnotations(working));
                    expand(gap, "both", Number.POSITIVE_INFINITY);
                };
                viewer = diffViewer;
                diffViewer.render({ fileDiff, containerWrapper: host });
            }
        } catch (cause) { error = `Couldn’t render this diff: ${cause instanceof Error ? cause.message : String(cause)}`; }
    }
    $: if (mounted && change && options && readingKey !== undefined) render();
    onMount(() => { mounted = true; return () => { disconnectColumns(); viewer?.cleanUp(); }; });
</script>

{#if change.has_conflict}<p class="notice">Unresolved conflict — showing conflict markers.</p>{/if}
{#if error}<p class="notice" role="status">{error}</p>{/if}
<div dir="ltr" class="diff-viewer" bind:clientWidth={width} aria-label={`Diff for ${change.path.relative_path}`}>
    <div class="diff-content" bind:this={host}></div>
    <DiffScrollbars columns={scrollColumns} />
</div>

<style>
    .diff-viewer { pointer-events: auto; user-select: text; min-width: 0; }
    .diff-viewer :global(diffs-container) { pointer-events: auto; }
    .notice { padding: 12px; color: var(--muted); font-size: 13px; }
    /* the unfolded counterpart of a separator: same row, chevron flipped, so expand and collapse share one place */
    .diff-viewer :global(.diff-fold) {
        display: flex; align-items: center; gap: 0; width: 100%; height: 24px; padding: 0; margin: 2px 0;
        border: 0; border-radius: 6px; background: transparent; color: var(--muted);
        font: var(--type-caption) var(--stack-ui); text-align: start; cursor: pointer;
    }
    .diff-viewer :global(.diff-fold svg) { width: 22px; height: 14px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @media (hover: hover) { .diff-viewer :global(.diff-fold:hover) { background: var(--hover); color: var(--text); } }
    .diff-viewer :global(.diff-fold:focus-visible) { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
</style>
