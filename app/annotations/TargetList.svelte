<script lang="ts">
    import Icon from "../controls/Icon.svelte";
    import type { AnchorState } from "../messages/AnchorState";
    import type { AnnotationAnchor } from "../messages/AnnotationAnchor";
    import { anchorDescription, anchorIcon, anchorLabel, sameAnchor } from "./anchors";

    interface Props {
        targets: { anchor: AnnotationAnchor; subject: string; state?: AnchorState }[];
        removable?: boolean;
        highlight?: AnnotationAnchor[];
        onRemove?: (anchor: AnnotationAnchor) => void;
    }

    let {
        targets,
        removable = false,
        highlight = [],
        onRemove = () => {}
    }: Props = $props();

    function outdated(state: AnchorState | undefined): string | null {
        if (!state) return null;
        if (state.type === "missing") return "This change no longer exists";
        if (state.type !== "rewritten") return null;
        return state.matches === false ? "Rewritten since; the annotated lines changed" : state.matches === true ? "Rewritten since; the annotated lines are unchanged" : "Rewritten since this note was written";
    }
</script>

<ul class="targets" aria-label="Points at">
    {#each targets as target (JSON.stringify(target.anchor))}
        {@const warning = outdated(target.state)}
        <li class="target" class:added={highlight.some(anchor => sameAnchor(anchor, target.anchor))} class:warned={!!warning} title={anchorDescription(target.anchor, target.subject)}>
            <Icon name={anchorIcon(target.anchor)} />
            <span class="label">{anchorLabel(target.anchor)}</span>
            {#if target.anchor.kind !== "revision"}<span class="change">{target.anchor.change_id.slice(0, 4)}</span>{/if}
            {#if target.anchor.kind === "lines" && target.anchor.side === "old"}<span class="side" title="Before the change">old</span>{/if}
            {#if warning}<span class="warning" role="img" aria-label={warning} title={warning}><Icon name="alert-triangle" /></span>{/if}
            <span class="sr-only">{anchorDescription(target.anchor, target.subject)}</span>
            {#if removable}<button type="button" class="remove" aria-label="Stop pointing at {anchorLabel(target.anchor)}" title="Remove" onclick={() => onRemove(target.anchor)}><Icon name="x" /></button>{/if}
        </li>
    {/each}
</ul>

<style>
    .targets { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .target { position: relative; display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; height: 24px; padding: 0 8px 0 6px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font-size: var(--type-caption); --icon-size: 12px; }
    .target > :global(svg) { flex: none; color: var(--muted); }
    .label { min-width: 0; overflow: hidden; font: var(--font-id); text-overflow: ellipsis; white-space: nowrap; }
    .change, .side { flex: none; color: var(--muted); font: 11px/1 var(--stack-code); }
    .warning { display: inline-flex; color: var(--warning); --icon-size: 12px; }
    .target.warned { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
    /* revealed on hover, but always reachable by keyboard and screen readers */
    .remove { display: grid; place-items: center; width: 18px; height: 18px; margin: 0 -4px 0 0; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--muted); cursor: pointer; --icon-size: 12px; }
    @media (hover: hover) and (pointer: fine) {
        .remove { width: 0; margin-inline-end: -5px; opacity: 0; overflow: hidden; }
        .target:hover .remove, .target:focus-within .remove { width: 18px; margin-inline-end: -4px; opacity: 1; }
    }
    @media (hover: none), (pointer: coarse) { .remove { width: 32px; height: 32px; margin-inline-end: -8px; } .target { height: 32px; border-radius: 16px; } }
    @media (hover: hover) { .remove:hover { background: var(--interaction-hover); color: var(--text); } }
    .remove:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -1px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    /* answers Add to: the new place lights up once, so you can see where it went */
    @media (prefers-reduced-motion: no-preference) {
        .target.added { animation: added 1.4s ease-out; }
        @keyframes added { 0%, 30% { border-color: var(--text); background: var(--interaction-selected); } }
    }
    .target.added { border-color: color-mix(in srgb, var(--text) 50%, var(--border)); }
</style>
