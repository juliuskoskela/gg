<script lang="ts" module>
    import { registerCustomCSSVariableTheme } from "@pierre/diffs";

    // keep syntax and diff surfaces on the same theme as the surrounding workspace.
    registerCustomCSSVariableTheme("gg", {});

    let FOLD_CSS = `
        [data-separator=custom] { height: 32px; margin: 0; }
        [data-gutter] [data-separator=custom] { display: block; position: relative; z-index: 2; }
        /* the fold control is interface, not source: it sizes to its label and never wraps with the code.
           wrapped diffs drop the column variables, so there it starts after the gutter */
        [data-gutter] [data-separator=custom] slot { display: block; position: absolute; inset-inline-start: var(--diffs-column-number-width, 100%); width: max-content; }
        [data-content] [data-separator=custom] slot { display: none; }
        [data-line-annotation] { --diffs-annotation-bg: var(--surface); }
        @media (pointer: coarse), (max-width: 600px) { [data-separator=custom] { height: 48px; } }
    `;
</script>

<script lang="ts">
    import { FileDiff, File, parsePatchFiles, type FileDiffOptions, type FileDiffMetadata, type DiffLineAnnotation, type HunkData, type SelectedLineRange, type PostRenderPhase } from "@pierre/diffs";
    import { onMount, untrack } from "svelte";
    import { createDiffFoldRow } from "./revision/DiffFoldRow";
    import { FoldingFileDiff } from "./revision/FoldingFileDiff";
    import DiffScrollbars from "./revision/DiffScrollbars.svelte";
    import type { RevChange } from "./messages/RevChange";
    import type { DiffNote } from "./annotations/diffNotes";
    import { createDiffNoteMarkers } from "./annotations/diffNoteMarkers";
    import { changePatch } from "./diff";
    import { diffStyle, diffWrap, fileHorizontalPositions } from "./stores";
    import { colorVision, effectiveTheme } from "./display/theme";

    interface Props {
        noteMarkers?: DiffNote[];
        change: RevChange;
        readingKey?: string;
        themeOverride?: "light" | "dark";
        fullContext?: boolean;
        loadFullFiles?: (() => Promise<{ before: string; after: string }>) | null;
        onLineMenu?: ((event: MouseEvent, range: { side: "additions" | "deletions"; start: number; end: number }) => void) | null;
    }
    let { change, noteMarkers = [], readingKey = "", themeOverride, fullContext = false, loadFullFiles = null, onLineMenu = null }: Props = $props();
    let notesRenderer = createDiffNoteMarkers();
    let selectedRange: SelectedLineRange | null = null;
    let renderedKey = "";
    let disconnectColumns = () => {};
    let host!: HTMLDivElement;
    let leadingFold!: HTMLDivElement;
    let pendingAnchor: { gap: number; top: number; left: number; focus: boolean } | undefined;
    let toggling = false;
    let leadingKey = "";
    let renderGeneration = 0;
    let anchorFrame: number | undefined;
    let width = $state(0);
    let resolvedStyle = $derived( $diffStyle === "auto" ? (width >= 720 ? "split" : "unified") : $diffStyle);
    let viewer: FileDiff<number> | File | undefined;
    let error = $state("");
    let mounted = $state(false);
    let scrollColumns = $state.raw<HTMLElement[]>([]);
    // gap index i is the unchanged block before hunk i; hunks.length is the block after the last hunk
    let unfolded = new Set<number>();
    let options = $derived({
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
        // colour-vision palettes can't rely on tints alone; +/− markers carry the change for everyone
        diffIndicators: $colorVision === "typical" ? "bars" as const : "classic" as const,
        enableLineSelection: true,
        onLineSelected: (range: SelectedLineRange | null) => { selectedRange = range; },
        disableFileHeader: true,
        onPostRender: postRender,
        unsafeCSS: ":host([data-has-note-markers]) [data-column-number] { padding-inline-start: var(--space-6); } slot[data-note-marker] { position: absolute; inset-inline-start: 0; inset-block: 0; width: var(--space-6); display: flex; align-items: stretch; } :host { color-scheme: inherit !important; --diffs-font-family: var(--stack-code); --diffs-font-size: var(--type-code); --diffs-line-height: calc(var(--type-code) * var(--code-leading)); --diffs-bg-context-override: var(--surface); --diffs-bg-buffer-override: var(--diff-buffer); --diffs-bg-separator-override: var(--raised); --diffs-fg-number-override: var(--muted); --diffs-addition-color-override: var(--positive); --diffs-deletion-color-override: var(--negative); --diffs-selection-color-override: var(--selection-bg); --diffs-bg-addition-override: var(--diff-addition); --diffs-bg-addition-emphasis-override: var(--diff-addition-emphasis); --diffs-bg-deletion-override: var(--diff-deletion); --diffs-bg-deletion-emphasis-override: var(--diff-deletion-emphasis); } [data-code] { scrollbar-width: none; } [data-code]::-webkit-scrollbar { height: 0; }" + FOLD_CSS,
    } satisfies FileDiffOptions<number, undefined>);
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
    function foldAnnotations(fileDiff: FileDiffMetadata): DiffLineAnnotation<number>[] {
        let result: DiffLineAnnotation<number>[] = [];
        for (let gap of [...unfolded].sort((a, b) => a - b)) {
            let anchor = gapAnchors(fileDiff, gap);
            if (!anchor) continue;
            let previous = fileDiff.hunks[gap - 1];
            // a pure insertion/deletion has no line to annotate on its empty side.
            if (resolvedStyle === "split" && previous.deletionCount > 0) result.push({ side: "deletions", lineNumber: anchor.deletions, metadata: gap });
            if (previous.additionCount > 0) result.push({ side: "additions", lineNumber: anchor.additions, metadata: gap });
            else if (resolvedStyle !== "split") result.push({ side: "deletions", lineNumber: anchor.deletions, metadata: gap });
        }
        return result;
    }
    function renderSeparator(hunk: HunkData) {
        if (fullContext) return null;
        let lines = hunk.lineCountKnown ? hunk.lines : undefined;
        let button = createDiffFoldRow({ gap: hunk.hunkIndex, lines, expanded: false, onToggle: button => toggle(hunk.hunkIndex, button) });
        button.disabled = !hunk.expandable;
        return button;
    }
    function renderFold(annotation: DiffLineAnnotation<number>, fileDiff: FileDiffMetadata) {
        let gap = annotation.metadata;
        if (gap === undefined) return undefined;
        return createDiffFoldRow({ gap, lines: gapSize(fileDiff, gap), expanded: true, onToggle: button => toggle(gap, button) });
    }
    function lineMenu(event: MouseEvent) {
        if (!onLineMenu) return;
        let target = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && (node.hasAttribute("data-line") || node.hasAttribute("data-column-number")));
        let line = Number(target?.getAttribute("data-line") ?? target?.getAttribute("data-column-number"));
        if (!target || !Number.isInteger(line) || line < 1) return;
        let column = target.closest("[data-deletions], [data-additions]");
        let side: "additions" | "deletions" = (target.getAttribute("data-line-type") ?? "").includes("deletion") || (column?.hasAttribute("data-deletions") && !column.hasAttribute("data-additions")) ? "deletions" : "additions";
        let start = line, end = line;
        let range = selectedRange;
        if (range && (range.side ?? "additions") === side && (range.endSide ?? range.side ?? "additions") === side) {
            let low = Math.min(range.start, range.end), high = Math.max(range.start, range.end);
            if (line >= low && line <= high) { start = low; end = high; }
        }
        event.preventDefault();
        onLineMenu(event, { side, start, end });
    }

    function postRender(node: HTMLElement, _instance: unknown, phase: PostRenderPhase) {
        if (phase === "unmount") return;
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
        notesRenderer.update(node, noteMarkers);
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
        notesRenderer.destroy();
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
                let diffViewer = new FoldingFileDiff(options);
                viewer = diffViewer;
                diffViewer.render({ fileDiff, containerWrapper: host });
            }
        } catch (cause) { error = `Couldn’t render this diff: ${cause instanceof Error ? cause.message : String(cause)}`; }
    }
    $effect(() => {
        let ready = mounted, file = change, settings = options, key = readingKey;
        if (ready && file && settings && key !== undefined) untrack(render);
    });
    $effect(() => {
        let markers = noteMarkers, ready = mounted;
        if (ready) untrack(() => { let container = host.querySelector<HTMLElement>("diffs-container"); if (container) notesRenderer.update(container, markers); });
    });
    onMount(() => {
        mounted = true;
        return () => {
            mounted = false;
            cancelPendingToggle();
            disconnectColumns();
            notesRenderer.destroy();
            viewer?.cleanUp();
            viewer = undefined;
        };
    });
</script>

{#if change.has_conflict}<p class="notice">Unresolved conflict — showing conflict markers.</p>{/if}
{#if error}<p class="notice" role="status">{error}</p>{/if}
<div dir="ltr" class="diff-viewer" bind:clientWidth={width} aria-label={`Diff for ${change.path.relative_path}`}>
    <div class="diff-leading-fold" bind:this={leadingFold}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions (the menu is also reachable from the Annotations view and the hunk menu) -->
    <div class="diff-content" bind:this={host} oncontextmenu={lineMenu}></div>
    <DiffScrollbars columns={scrollColumns} />
</div>

<style>
    .diff-viewer { pointer-events: auto; user-select: text; min-width: 0; }
    .diff-viewer :global(diffs-container) { pointer-events: auto; }
    .notice { padding: 12px; color: var(--muted); font-size: 13px; }
    .diff-viewer :global(.diff-fold) {
        display: flex; align-items: center; gap: 6px; width: max-content; max-width: calc(100% - 16px); min-height: 28px; padding: 4px 10px 4px 8px; margin: 2px 8px;
        border: 0; border-radius: 4px; background: var(--raised); color: var(--muted);
        font: var(--font-label); text-align: start; cursor: pointer; white-space: nowrap;
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
