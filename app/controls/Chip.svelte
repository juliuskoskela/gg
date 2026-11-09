<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        tone?: "neutral" | "bookmark" | "remote" | "tag" | "workspace";
        context: boolean;
        target: boolean;
        disconnected?: boolean;
        immobile?: boolean;
        tip?: string;
        children?: Snippet;
    }

    let {
        tone = "neutral",
        context,
        target,
        disconnected = false,
        immobile = false,
        tip = "",
        children
    }: Props = $props();
</script>

<div class="chip" data-tone={tone} class:context class:target class:disconnected class:immobile title={tip}>
    {@render children?.()}
</div>

<style>
    .chip {
        pointer-events: auto;

        font-family: var(--stack-ui);
        font-size: var(--type-ui);

        min-height: 22px;
        line-height: 1.25;

        display: flex;
        align-items: center;
        --ref-tone: var(--muted);
        color: var(--ref-tone);
        border: 1px solid color-mix(in oklab, var(--ref-tone) 12%, transparent);
        border-radius: var(--radius-sm);
        padding: 0 6px;
        background: color-mix(in oklab, var(--ref-tone) 4%, transparent);
        white-space: nowrap;
        gap: 4px;
    }

    .chip[data-tone="bookmark"] { --ref-tone: var(--ref-bookmark, var(--muted)); }
    .chip[data-tone="remote"] { --ref-tone: var(--ref-remote, var(--muted)); }
    .chip[data-tone="tag"] { --ref-tone: var(--ref-tag, var(--muted)); }
    .chip[data-tone="workspace"] { --ref-tone: var(--ref-workspace, var(--muted)); }
    .chip:not(.context):not(.target) > :global(svg:first-child) { color: var(--ref-tone); }

    :global(.selection-item[aria-selected="true"]) .chip { border-color: color-mix(in oklab, var(--ref-tone) 20%, transparent); }

    .context {
        color: inherit;
        border-color: var(--control-border);
        background: var(--hover);
    }

    .target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }

    .disconnected {
        border-style: dashed;
    }

    .immobile:not(.context):not(.target) {
        border-color: transparent;
    }
</style>
