<script lang="ts">
    import type { Snippet } from "svelte";
    import PanelFooter from "../controls/PanelFooter.svelte";
    import Icon from "../controls/Icon.svelte";
    import { placementTransform, type PaneSide } from "../tree/placement";

    // the diff's file bar, the bottom bar of the diff itself; its toggle shows or hides the changed-files pane wherever that sits
    interface Props {
        /** number of changed files */
        total: number;
        /** index of the selected file, or -1 */
        index: number;
        /** without a pane the bar is just the file's own controls, for compact views */
        pane?: boolean;
        open?: boolean;
        side?: PaneSide;
        /** the id of the pane the toggle controls */
        controls?: string;
        onToggle?: () => void;
        children: Snippet;
    }

    let { total, index, pane = true, open = false, side = "bottom", controls = undefined, onToggle = () => {}, children }: Props = $props();
</script>

<PanelFooter className="diff-footer"><div class="diff-toolbar">
    {@render children()}
    {#if pane}
        {#if index >= 0}<span class="position">{index + 1} of {total}</span>{/if}
        <button class="pane-toggle" type="button" aria-expanded={open} aria-controls={controls} aria-label={open ? "Hide changed files" : "Show changed files"} title={open ? "Hide changed files" : "Show changed files"} onclick={onToggle}><span class="glyph" style:transform={placementTransform(side) || undefined}><Icon name="sidebar" /></span></button>
    {/if}
</div></PanelFooter>

<style>
    .diff-toolbar { container: diff-file-bar / inline-size; display: flex; align-items: center; gap: var(--space-1); width: 100%; min-width: 0; min-height: var(--control-height); }
    /* a narrow diff (a browser beside it) truncates the path instead of letting it spill over its neighbours */
    .diff-toolbar > :global(.file-path) { flex: 1; min-width: 0; overflow: hidden; }
    .diff-toolbar :global(.file-path .layout) { min-width: 0; }
    .diff-toolbar :global(.file-path .layout > span:not(.stat):not(.kind)) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .diff-toolbar :global(.file-path .layout) { min-height: 32px; padding: var(--space-1); }
    .diff-toolbar :global(.file-path .layout span) { white-space: nowrap; }
    .diff-toolbar :global(.file-navigation) { display: flex; align-items: center; flex-shrink: 0; }
    /* the position is the first thing to go when space runs out; the chevrons still navigate */
    @container diff-file-bar (max-width: 380px) { .position { display: none; } }
    .position { flex: none; padding-inline: var(--space-2); color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }
    /* only the bar's own icon buttons; the review control and file path bring their own */
    .diff-toolbar :global(.file-navigation button), .pane-toggle { display: inline-flex; align-items: center; justify-content: center; padding: 0; width: 24px; min-height: 28px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; --icon-size: 15px; }
    .pane-toggle .glyph { display: inline-flex; }
    .diff-toolbar :global(.review-back) { width: auto; min-height: 28px; padding-inline: var(--space-2); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); cursor: pointer; font: var(--font-label); white-space: nowrap; }
    .diff-toolbar :global(.file-navigation button:disabled) { color: var(--text-disabled); cursor: default; }
    @media (hover: hover) { .diff-toolbar :global(.file-navigation button:not(:disabled):hover), .diff-toolbar :global(.review-back:hover), .pane-toggle:hover { background: var(--hover); color: var(--text); } }
    .diff-toolbar :global(.file-navigation button:not(:disabled):active), .diff-toolbar :global(.review-back:active), .pane-toggle:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .diff-toolbar :global(.file-path .layout) { min-height: 44px; } .diff-toolbar :global(.file-navigation button), .pane-toggle { min-width: 44px; min-height: 44px; } }
</style>
