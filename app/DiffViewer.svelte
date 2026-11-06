<script lang="ts" context="module">
    import { registerCustomCSSVariableTheme } from "@pierre/diffs";

    export type DiffNote = { id: string; side: "additions" | "deletions"; line: number; label: string; onClick: () => void };
    type Annotation = number | DiffNote;

    // keep syntax and diff surfaces on the same theme as the surrounding workspace.
    registerCustomCSSVariableTheme("gg", {});

    let FOLD_CSS = `
        [data-separator=custom] { height: 32px; margin: 0; }
        [data-gutter] [data-separator=custom] { display: block; position: relative; z-index: 2; }
        [data-gutter] [data-separator=custom] slot { display: block; position: absolute; inset-inline-start: var(--diffs-column-number-width, 0px); width: var(--diffs-column-content-width, 100%); }
        [data-content] [data-separator=custom] slot { display: none; }
        [data-line-annotation] { --diffs-annotation-bg: var(--surface); }
        @media (pointer: coarse), (max-width: 600px) { [data-separator=custom] { height: 48px; } }
    `;
</script>

<script lang="ts">
    import { FileDiff, File, parsePatchFiles, type FileDiffOptions, type FileDiffMetadata, type DiffLineAnnotation, type HunkData, type SelectedLineRange } from "@pierre/diffs";
    import { onMount } from "svelte";
    import { createDiffFoldRow } from "./revision/DiffFoldRow";
    import { FoldingFileDiff } from "./revision/FoldingFileDiff";
    import DiffScrollbars from "./revision/DiffScrollbars.svelte";
    import type { RevChange } from "./messages/RevChange";
    import { changePatch } from "./diff";
    import { diffStyle, diffWrap, fileHorizontalPositions } from "./stores";
    import { effectiveTheme } from "./display/theme";

    export let change: RevChange;
    export let onSelectLine: ((range: SelectedLineRange | null) => void) | null = null;
    export let lineNotes: DiffNote[] = [];
    export let readingKey = "";
    export let themeOverride: "light" | "dark" | undefined = undefined;
    export let fullContext = false;
    // supplies both complete sides so collapsed blocks can be unfolded one at a time
    export let loadFullFiles: (() => Promise<{ before: string; after: string }>) | null = null;
    let renderedKey = "";
    let disconnectColumns = () => {};
    let host: HTMLDivElement;
    let leadingFold: HTMLDivElement;
    let pendingAnchor: { gap: number; top: number; left: number; focus: boolean } | undefined;
    let toggling = false;
    let leadingKey = "";
    let renderGeneration = 0;
    let anchorFrame: number | undefined;
    let width = 0;
    $: resolvedStyle = $diffStyle === "auto" ? (width >= 720 ? "split" : "unified") : $diffStyle;
    let viewer: FileDiff<Annotation> | File | undefined;
    let error = "";
    let mounted = false;
    let scrollColumns: HTMLElement[] = [];
    // gap index i is the unchanged block before hunk i; hunks.length is the block after the last hunk
    let unfolded = new Set<number>();
    $: options = {
        theme: "gg",
        themeType: themeOverride ?? $effectiveTheme,
        diffStyle: resolvedStyle,
        overflow: $diffWrap ? "wrap" as const : "scroll" as const,
        expandUnchanged: fullContext,
        // one click unfolds the whole block, so never split it into partial chunks
        expansionLineCount: 1_000_000_000,
        loadDiffFiles: loadFullFiles && !fullContext ? loadDiffFiles : undefined,
        hunkSeparators: renderSeparator,
        renderAnnotation: renderFold,
        lineDiffType: "word-alt" as const,
        enableLineSelection: true,
        onLineSelectionEnd: (range: SelectedLineRange | null) => onSelectLine?.(range),
        disableFileHeader: true,
        onPostRender: postRender,
        unsafeCSS: ":host { color-scheme: inherit !important; --diffs-font-family: var(--stack-code); --diffs-font-size: var(--type-code); --diffs-line-height: calc(var(--type-code) * var(--code-leading)); --diffs-bg-context-override: var(--surface); --diffs-bg-buffer-override: var(--diff-buffer); --diffs-bg-separator-override: var(--raised); --diffs-fg-number-override: var(--muted); --diffs-addition-color-override: var(--positive); --diffs-deletion-color-override: var(--negative); --diffs-selection-color-override: var(--selection-bg); --diffs-bg-addition-override: var(--diff-addition); --diffs-bg-addition-emphasis-override: var(--diff-addition-emphasis); --diffs-bg-deletion-override: var(--diff-deletion); --diffs-bg-deletion-emphasis-override: var(--diff-deletion-emphasis); } [data-code] { scrollbar-width: none; } [data-code]::-webkit-scrollbar { height: 0; }" + FOLD_CSS,
    } satisfies FileDiffOptions<Annotation, undefined>;
    async function loadDiffFiles(fileDiff: FileDiffMetadata) {
        let files = await loadFullFiles!();
        return { oldFile: { name: fileDiff.prevName ?? fileDiff.name, contents: files.before }, newFile: { name: fileDiff.name, contents: files.after } };
    }
    function gapAnchors(fileDiff: FileDiffMetadata, gap: number): { additions: number; deletions: number } | null {
        let hunks = fileDiff.hunks;
        if (gap === 0) return null;
        let previous = hunks[gap - 1];
        if (!previous) return null;
        return { additions: previous.additionStart + Math.max(previous.additionCount, 1) - 1, deletions: previous.deletionStart + Math.max(previous.deletionCount, 1) - 1 };
    }
    function gapSize(fileDiff: FileDiffMetadata, gap: number) {
        let hunks = fileDiff.hunks;
        if (gap < hunks.length) return hunks[gap].collapsedBefore;
        let last = hunks[hunks.length - 1];
        return last ? Math.max(0, fileDiff.additionLines.length - (last.additionStart + Math.max(last.additionCount, 1) - 1)) : 0;
    }
    function foldAnnotations(fileDiff: FileDiffMetadata): DiffLineAnnotation<Annotation>[] {
        let result: DiffLineAnnotation<Annotation>[] = [];
        for (let gap of [...unfolded].sort((a, b) => a - b)) {
            let anchor = gapAnchors(fileDiff, gap);
            if (!anchor) continue;
            let previous = fileDiff.hunks[gap - 1];
            // a pure insertion/deletion has no line to annotate on its empty side.
            if (resolvedStyle === "split" && previous.deletionCount > 0) result.push({ side: "deletions", lineNumber: anchor.deletions, metadata: gap });
            if (previous.additionCount > 0) result.push({ side: "additions", lineNumber: anchor.additions, metadata: gap });
            else if (resolvedStyle !== "split") result.push({ side: "deletions", lineNumber: anchor.deletions, metadata: gap });
        }
        return [...result, ...lineNotes.map(note => ({ side: note.side, lineNumber: note.line, metadata: note }))];
    }
    function renderSeparator(hunk: HunkData) {
        if (fullContext) return null;
        let lines = hunk.lineCountKnown ? hunk.lines : undefined;
        let button = createDiffFoldRow({ gap: hunk.hunkIndex, lines, expanded: false, onToggle: button => toggle(hunk.hunkIndex, button) });
        button.disabled = !hunk.expandable;
        return button;
    }
    function renderFold(annotation: DiffLineAnnotation<Annotation>, fileDiff: FileDiffMetadata) {
        let gap = annotation.metadata;
        if (gap === undefined) return undefined;
        if (typeof gap !== "number") {
            let button = document.createElement("button");
            button.type = "button"; button.className = "diff-review-note";
            button.textContent = gap.label; button.onclick = gap.onClick;
            return button;
        }
        return createDiffFoldRow({ gap, lines: gapSize(fileDiff, gap), expanded: true, onToggle: button => toggle(gap, button) });
    }
    function postRender(node: HTMLElement) {
        if (!mounted || !host?.contains(node)) return;
        connectScrollColumns(node);
        let columns = Array.from(node.shadowRoot?.querySelectorAll<HTMLElement>("[data-code]:not([data-diffs-scrollbar-measure])") ?? []);
        let lines = viewer instanceof FoldingFileDiff && viewer.diff ? gapSize(viewer.diff, 0) : 0;
        let nextLeadingKey = unfolded.has(0) ? `${columns.length}:${lines}` : "";
        if (nextLeadingKey !== leadingKey) {
            leadingKey = nextLeadingKey;
            leadingFold.replaceChildren();
            leadingFold.style.gridTemplateColumns = `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;
            if (unfolded.has(0)) for (let column of columns) {
                let cell = document.createElement("div");
                cell.style.paddingInlineStart = getComputedStyle(column).getPropertyValue("--diffs-column-number-width");
                cell.append(createDiffFoldRow({ gap: 0, lines, expanded: true, onToggle: button => toggle(0, button) }));
                leadingFold.append(cell);
            }
        }
        restoreAnchor();
    }
    function restoreAnchor() {
        if (!mounted || !host?.isConnected || !pendingAnchor) return;
        let buttons = Array.from(host.parentElement?.querySelectorAll<HTMLButtonElement>(`.diff-fold[data-fold-gap="${pendingAnchor.gap}"]`) ?? []);
        let left = pendingAnchor.left;
        let button = buttons.sort((a, b) => Math.abs(a.getBoundingClientRect().left - left) - Math.abs(b.getBoundingClientRect().left - left))[0];
        if (!button) return;
        let delta = button.getBoundingClientRect().top - pendingAnchor.top;
        // compensate every scroll ancestor, including the browser document, without scrolling unrelated panes.
        for (let parent = host.parentElement; parent && Math.abs(delta) > 0.5; parent = parent.parentElement) {
            if (parent.scrollHeight <= parent.clientHeight) continue;
            if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent !== document.scrollingElement) continue;
            let before = parent.scrollTop;
            parent.scrollTop += delta;
            delta -= parent.scrollTop - before;
        }
        if (pendingAnchor.focus) button.focus({ preventScroll: true });
    }
    async function toggle(gap: number, button: HTMLButtonElement) {
        if (!(viewer instanceof FoldingFileDiff) || toggling) return;
        let current = viewer;
        let generation = renderGeneration;
        error = "";
        toggling = true;
        pendingAnchor = { gap, top: button.getBoundingClientRect().top, left: button.getBoundingClientRect().left, focus: button.matches(":focus") };
        button.setAttribute("aria-busy", "true");
        try {
            if (!unfolded.has(gap)) {
                // annotations must reference complete line arrays, not the patch's packed line indices.
                await current.prepareForEditing();
                if (!mounted || generation !== renderGeneration || viewer !== current) return;
                unfolded.add(gap);
                current.setLineAnnotations(foldAnnotations(current.diff!));
                current.expandHunk(gap, "both", Number.POSITIVE_INFINITY);
            } else {
                unfolded.delete(gap);
                current.collapse(gap);
                current.setLineAnnotations(foldAnnotations(current.diff!));
                current.rerender();
            }
            // ResizeManager and highlighting may each produce a second layout pass.
            let anchor = pendingAnchor;
            if (anchorFrame !== undefined) cancelAnimationFrame(anchorFrame);
            anchorFrame = requestAnimationFrame(() => {
                anchorFrame = requestAnimationFrame(() => {
                    anchorFrame = undefined;
                    if (!mounted || generation !== renderGeneration || pendingAnchor !== anchor) return;
                    restoreAnchor();
                    pendingAnchor = undefined;
                });
            });
        } catch (cause) {
            if (!mounted || generation !== renderGeneration || viewer !== current) return;
            pendingAnchor = undefined;
            error = `Couldn’t load unmodified lines: ${cause instanceof Error ? cause.message : String(cause)}`;
        } finally {
            button.removeAttribute("aria-busy");
            if (generation === renderGeneration) toggling = false;
        }
    }
    export function revealLine(range: SelectedLineRange) {
        if (!(viewer instanceof FoldingFileDiff)) return;
        viewer.setSelectedLines(range);
        let selector = `[data-${range.side ?? "additions"}] [data-line="${range.end}"]`;
        let node = host.querySelector("diffs-container")?.shadowRoot;
        let line = node?.querySelector<HTMLElement>(selector) ?? node?.querySelector<HTMLElement>(`[data-line="${range.end}"]`);
        line?.scrollIntoView({ block: "center", inline: "nearest" });
    }
    function cancelPendingToggle() {
        renderGeneration++;
        pendingAnchor = undefined;
        toggling = false;
        if (anchorFrame !== undefined) cancelAnimationFrame(anchorFrame);
        anchorFrame = undefined;
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
        cancelPendingToggle();
        disconnectColumns();
        renderedKey = `${readingKey}:${resolvedStyle}`;
        viewer?.cleanUp();
        host.replaceChildren();
        leadingFold.replaceChildren();
        leadingKey = "";
        pendingAnchor = undefined;
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
                let diffViewer = new FoldingFileDiff<Annotation>(options);
                viewer = diffViewer;
                diffViewer.render({ fileDiff, containerWrapper: host, lineAnnotations: foldAnnotations(fileDiff) });
            }
        } catch (cause) { error = `Couldn’t render this diff: ${cause instanceof Error ? cause.message : String(cause)}`; }
    }
    $: if (mounted && change && options && readingKey !== undefined) render();
    $: if (mounted && lineNotes && viewer instanceof FoldingFileDiff && viewer.diff) viewer.setLineAnnotations(foldAnnotations(viewer.diff));
    onMount(() => {
        mounted = true;
        return () => {
            mounted = false;
            cancelPendingToggle();
            disconnectColumns();
            viewer?.cleanUp();
            viewer = undefined;
        };
    });
</script>

{#if change.has_conflict}<p class="notice">Unresolved conflict — showing conflict markers.</p>{/if}
{#if error}<p class="notice" role="status">{error}</p>{/if}
<div dir="ltr" class="diff-viewer" bind:clientWidth={width} aria-label={`Diff for ${change.path.relative_path}`}>
    <div class="diff-leading-fold" bind:this={leadingFold}></div>
    <div class="diff-content" bind:this={host}></div>
    <DiffScrollbars columns={scrollColumns} />
</div>

<style>
    .diff-viewer { pointer-events: auto; user-select: text; min-width: 0; }
    .diff-viewer :global(diffs-container) { pointer-events: auto; }
    .diff-viewer :global(.diff-review-note) { display: block; max-width: calc(100% - 24px); margin: 6px 12px; padding: 6px 10px; text-align: start; border: 0; border-inline-start: 2px solid var(--faint); border-radius: var(--radius-control); color: var(--text); background: var(--raised); font: var(--type-ui) var(--stack-ui); cursor: pointer; white-space: normal; }
    @media (hover: hover) { .diff-viewer :global(.diff-review-note:hover) { background: var(--interaction-hover); } }
    .diff-viewer :global(.diff-review-note:focus-visible) { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    .notice { padding: 12px; color: var(--muted); font-size: 13px; }
    .diff-viewer :global(.diff-fold) {
        display: flex; align-items: center; gap: 6px; width: calc(100% - 16px); min-height: 28px; padding: 4px 8px; margin: 2px 8px;
        border: 0; border-radius: 4px; background: var(--raised); color: var(--muted);
        font: var(--type-caption) var(--stack-ui); line-height: 20px; text-align: start; cursor: pointer; white-space: normal;
    }
    .diff-viewer :global(.diff-fold svg) { width: 14px; height: 14px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @media (hover: hover) { .diff-viewer :global(.diff-fold:not(:disabled):hover) { background: var(--interaction-hover, var(--hover)); color: var(--text); } }
    @media (pointer: coarse), (max-width: 600px) { .diff-viewer :global(.diff-fold) { min-height: 44px; } }
    .diff-viewer :global(.diff-fold:focus-visible) { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    .diff-viewer :global(.diff-fold:disabled) { cursor: default; }
    .diff-viewer :global(.diff-fold[aria-busy=true]) { cursor: progress; }
    .diff-content, .diff-leading-fold { overflow-anchor: none; }
    .diff-leading-fold { display: grid; }
    .diff-leading-fold:not(:empty) { padding-top: 8px; }
</style>
