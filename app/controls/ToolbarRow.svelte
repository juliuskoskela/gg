<script lang="ts">
    import type { Snippet } from "svelte";
    import { tick } from "svelte";
    interface Props {
        label: string;
        id?: string | undefined;
        hidden?: boolean;
        children?: Snippet;
    }

    let {
        label,
        id = undefined,
        hidden = false,
        children
    }: Props = $props();

    async function revealControl(event: FocusEvent) {
        let strip = event.currentTarget as HTMLElement, control = event.target as HTMLElement;
        await tick();
        if (!strip.isConnected || !control.isConnected) return;
        let bounds = strip.getBoundingClientRect(), target = control.getBoundingClientRect();
        let delta = target.left < bounds.left ? target.left - bounds.left : target.right > bounds.right ? target.right - bounds.right : 0;
        if (delta) strip.scrollBy({ left: delta, behavior: "instant" });
    }
</script>

<div class="view-toolbar" data-panel-toolbar {id} {hidden} role="group" aria-label={label} onfocusin={revealControl}>
    {@render children?.()}
</div>

<style>
    .view-toolbar {
        display: flex; flex: none; align-items: center; gap: var(--panel-gap); min-width: 0;
        min-height: var(--panel-toolbar-height); padding: var(--panel-bar-padding) var(--panel-inset);
        scrollbar-width: none; overflow-x: auto; overscroll-behavior-inline: contain; scroll-padding-inline: var(--panel-inset);
        border-block-end: 1px solid var(--panel-header-rule); background: var(--panel-toolbar-bg); color: var(--text);
        pointer-events: auto;
        --control-height: var(--panel-control-size);
        --control-padding-block: 3px;
        --hover: color-mix(in srgb, var(--text) 6%, var(--panel-toolbar-bg));
        --active: color-mix(in srgb, var(--text) 15%, var(--panel-toolbar-bg));
        --active-hover: color-mix(in srgb, var(--text) 19%, var(--panel-toolbar-bg));
        --control-pressed: color-mix(in srgb, var(--text) 23%, var(--panel-toolbar-bg));
        --border: color-mix(in srgb, var(--text) 14%, var(--panel-toolbar-bg));
        --input-surface: var(--panel-toolbar-bg);
        --panel-tools-wrap: nowrap;
        --panel-tools-justify: flex-end;
        --panel-tools-margin: auto;
    }
    .view-toolbar::-webkit-scrollbar { display: none; }
    .view-toolbar[hidden] { display: none; }
    /* tools sit at the trailing edge; what scopes or summarises the view (search, counts, select-all, filters) opts into the leading edge.
       a flexible spacer rather than flex-end keeps overflowing tools scrollable from their start */
    .view-toolbar::before { content: ""; flex: 1 1 0; order: 0; min-width: 0; }
    .view-toolbar > :global(*) { flex-shrink: 0; order: 1; }
    .view-toolbar > :global(.toolbar-lead) { order: -1; }
    .view-toolbar > :global(.diff-tools) { width: auto; }
    .view-toolbar :global(button:focus-visible) { outline-offset: -2px; }
    .view-toolbar :global(.toolbar-spacer) { margin-inline-start: auto; }
</style>
