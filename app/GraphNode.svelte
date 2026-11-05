<script lang="ts">
    import { revisionNodeRadius, revisionRowHeight } from "./graphLayout";
    import type { RevHeader } from "./messages/RevHeader";
    import { currentContext, revisionSelectEvent } from "./stores.js";

    export let header: RevHeader;
    export let rowHeight = revisionRowHeight;

    let context = false;
    $: context = $currentContext?.type == "Revision" && header == $currentContext.header;
    $: selected = $revisionSelectEvent?.from.commit.hex === header.id.commit.hex || $revisionSelectEvent?.to.commit.hex === header.id.commit.hex;
    $: wcClass = header.working_copy_of != null ? "other-wc" : "wc";
</script>

{#if header.is_immutable}
    {#if header.is_working_copy}
        <circle class={wcClass} cx="9" cy={rowHeight / 2} r={revisionNodeRadius} />
    {:else}
        <circle class="immutable" cx="9" cy={rowHeight / 2} r={revisionNodeRadius} />
    {/if}
{:else}
    <circle cx="9" cy={rowHeight / 2} r={revisionNodeRadius} class="mutable" />
    {#if header.is_working_copy}
        <circle class={wcClass} cx="9" cy={rowHeight / 2} r="2" />
    {/if}
{/if}

{#if selected}<circle class="selected" cx="9" cy={rowHeight / 2} r={revisionNodeRadius + 2} />{/if}

{#if context}<circle class="context" cx="9" cy={rowHeight / 2} r={revisionNodeRadius + 3} />{/if}

<style>
    circle {
        pointer-events: none;
        stroke: var(--graph-node);
        fill: none;
        stroke-width: 1;
    }

    .immutable { stroke: var(--graph-immutable); fill: var(--graph-immutable); }

    .wc {
        stroke: var(--positive);
        fill: var(--positive);
    }

    .other-wc {
        stroke: var(--warning);
        fill: var(--warning);
    }

    .selected { stroke: var(--accent); stroke-width: 1.25; fill: none; }
    .context { stroke: var(--graph-context); fill: none; }
</style>
