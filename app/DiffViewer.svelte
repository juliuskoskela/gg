<script lang="ts" context="module">
    import { registerCustomCSSVariableTheme } from "@pierre/diffs";

    // keep syntax and diff surfaces on the same theme as the surrounding workspace.
    registerCustomCSSVariableTheme("gg", {});
</script>

<script lang="ts">
    import { FileDiff, File, parsePatchFiles, type FileDiffOptions } from "@pierre/diffs";
    import { onMount } from "svelte";
    import DiffScrollbars from "./revision/DiffScrollbars.svelte";
    import type { RevChange } from "./messages/RevChange";
    import { changePatch } from "./diff";
    import { diffStyle, diffWrap, fileHorizontalPositions } from "./stores";
    import { effectiveTheme } from "./display/theme";

    export let change: RevChange;
    export let readingKey = "";
    let renderedKey = "";
    let disconnectColumns = () => {};
    let host: HTMLDivElement;
    let width = 0;
    $: resolvedStyle = $diffStyle === "auto" ? (width >= 720 ? "split" : "unified") : $diffStyle;
    let viewer: FileDiff | File | undefined;
    let error = "";
    let mounted = false;
    let scrollColumns: HTMLElement[] = [];
    $: options = {
        theme: "gg",
        themeType: $effectiveTheme,
        diffStyle: resolvedStyle,
        overflow: $diffWrap ? "wrap" as const : "scroll" as const,
        lineDiffType: "word-alt" as const,
        enableLineSelection: true,
        disableFileHeader: true,
        onPostRender: connectScrollColumns,
        unsafeCSS: ":host { color-scheme: inherit !important; --diffs-font-family: var(--stack-code); --diffs-font-size: var(--type-code); --diffs-line-height: calc(var(--type-code) * var(--code-leading)); --diffs-bg-context-override: var(--surface); --diffs-bg-buffer-override: var(--diff-buffer); --diffs-bg-separator-override: var(--raised); --diffs-fg-number-override: var(--muted); --diffs-addition-color-override: var(--positive); --diffs-deletion-color-override: var(--negative); --diffs-selection-color-override: var(--selection-bg); --diffs-bg-addition-override: var(--diff-addition); --diffs-bg-addition-emphasis-override: var(--diff-addition-emphasis); --diffs-bg-deletion-override: var(--diff-deletion); --diffs-bg-deletion-emphasis-override: var(--diff-deletion-emphasis); } [data-code] { scrollbar-width: none; } [data-code]::-webkit-scrollbar { height: 0; }",
    } satisfies FileDiffOptions<undefined, undefined>;
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
        error = "";
        try {
            if (change.has_conflict) {
                viewer = new File(options);
                viewer.render({ file: { name: change.path.relative_path, contents: change.hunks.flatMap(hunk => hunk.lines.lines.map(line => line.slice(1))).join("") }, containerWrapper: host });
            } else {
                let fileDiff = parsePatchFiles(changePatch(change))[0]?.files[0];
                if (!fileDiff) { error = "No text diff available. This file may be binary or have only metadata changes."; return; }
                fileDiff.name = change.path.relative_path;
                fileDiff.prevName = undefined;
                viewer = new FileDiff(options);
                viewer.render({ fileDiff, containerWrapper: host });
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
</style>
