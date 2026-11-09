<script lang="ts">
    import { onDestroy } from "svelte";
    import Icon from "../controls/Icon.svelte";
    import type { AnnotationThread } from "../messages/AnnotationThread";
    import { dock } from "../workspace/dock";
    import { anchorLabel } from "./anchors";
    import { noteTitle, openAnnotation } from "./store";

    interface Props {
        notes: AnnotationThread[];
    }

    let { notes }: Props = $props();

    let marker!: HTMLSpanElement;
    let preview!: HTMLDivElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let label = $derived(notes.length === 1 ? "1 note" : `${notes.length} notes`);
    let previews = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

    // the preview lives in the top layer, so virtualized rows and clipped panes can't cut it off
    function show() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!preview?.showPopover || !marker?.isConnected) return;
            let bounds = marker.getBoundingClientRect();
            preview.style.left = `${Math.min(bounds.left, window.innerWidth - 300)}px`;
            preview.style.top = `${bounds.bottom + 6}px`;
            try { preview.showPopover(); } catch { /* already open */ }
        }, 250);
    }
    function hide() {
        clearTimeout(timer);
        try { preview?.hidePopover(); } catch { /* already closed */ }
    }
    function open(event: MouseEvent) {
        event.stopPropagation();
        hide();
        openAnnotation.set(notes[0].id);
        dock.open("annotations");
    }
    onDestroy(hide);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (rows are options; keyboard users reach notes from the Annotations view) -->
<span class="note-marker" bind:this={marker} title={previews ? undefined : label} onpointerenter={show} onpointerleave={hide} onpointerdown={event => event.stopPropagation()} onclick={open} ondblclick={event => event.stopPropagation()}>
    <Icon name="message-square" />{#if notes.length > 1}<span>{notes.length}</span>{/if}
    <span class="sr-only">, {label}</span>
</span>
<div class="note-preview" popover="manual" bind:this={preview} aria-hidden="true">
    {#each notes.slice(0, 3) as note (note.id)}
        <p><span class="where">{anchorLabel(note.targets[0].anchor)}{#if note.targets.length > 1}<span class="more-places"> +{note.targets.length - 1}</span>{/if}</span><span class="what">{noteTitle(note)}</span></p>
    {/each}
    {#if notes.length > 3}<p class="more">{notes.length - 3} more</p>{/if}
</div>

<style>
    .note-marker { display: inline-flex; flex: none; align-items: center; gap: 2px; margin-inline-end: 6px; color: var(--muted); font-size: var(--type-caption); font-variant-numeric: tabular-nums; vertical-align: middle; cursor: pointer; pointer-events: auto; --icon-size: 13px; }
    @media (hover: hover) { .note-marker:hover { color: var(--text); } }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .note-preview { position: fixed; inset: auto; margin: 0; width: max-content; max-width: 300px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--popover-surface); color: var(--text); box-shadow: var(--shadow-overlay); font: var(--type-caption)/1.5 var(--stack-ui); pointer-events: none; }
    .note-preview p { display: grid; margin: 4px 0; }
    .where { color: var(--muted); font-family: var(--stack-code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more { color: var(--muted); }
</style>
