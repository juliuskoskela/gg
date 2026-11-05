<script lang="ts">
    export let tone: "neutral" | "bookmark" | "remote" | "tag" | "workspace" = "neutral";
    export let context: boolean;
    export let target: boolean;
    export let disconnected: boolean = false;
    export let immobile: boolean = false;
    export let tip: string = "";
</script>

<div class="chip" data-tone={tone} class:context class:target class:disconnected class:immobile title={tip}>
    <slot />
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
        color: color-mix(in oklab, var(--ref-tone) 48%, var(--text));
        border: 1px solid color-mix(in oklab, var(--ref-tone) 22%, transparent);
        border-radius: var(--radius-sm);
        padding: 0 6px;
        background: color-mix(in oklab, var(--ref-tone) 8%, transparent);
        white-space: nowrap;
        gap: 4px;
    }

    .chip[data-tone="bookmark"] { --ref-tone: var(--ref-bookmark, var(--muted)); }
    .chip[data-tone="remote"] { --ref-tone: var(--ref-remote, var(--muted)); }
    .chip[data-tone="tag"] { --ref-tone: var(--ref-tag, var(--muted)); }
    .chip[data-tone="workspace"] { --ref-tone: var(--ref-workspace, var(--muted)); }
    .chip:not(.context):not(.target) > :global(svg:first-child) { color: var(--ref-tone); }

    :global(.selection-item[aria-selected="true"]) .chip { color: color-mix(in oklab, var(--ref-tone) 45%, var(--text-strong)); border-color: color-mix(in oklab, var(--ref-tone) 38%, transparent); }
    @media (hover: hover) { :global(.selection-item:hover) .chip { color: color-mix(in oklab, var(--ref-tone) 45%, var(--text-strong)); } }

    .context {
        color: inherit;
        border-color: var(--control);
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
