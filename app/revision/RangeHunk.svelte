<script lang="ts">
    import type { ChangeHunk } from "../messages/ChangeHunk";
    import type { RevHeader } from "../messages/RevHeader";
    import { rangeHunkTargets } from "./origins";
    import OriginLink from "./OriginLink.svelte";
    import { lineMenu } from "../annotations/store";
    import { MAX_LINES } from "../annotations/anchors";
    import { targetCommands } from "../annotations/commands";
    let { hunk, path, headers }: { hunk: ChangeHunk; path: string; headers: RevHeader[] } = $props();
    let targets = $derived(rangeHunkTargets(hunk, path, headers));
    let tooMany = $derived(hunk.lines.lines.filter(line => line.startsWith("+") || line.startsWith("-")).length > MAX_LINES);
    function annotate(event: MouseEvent) {
        event.stopPropagation();
        let bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        lineMenu.set({ x: event.detail ? event.clientX : bounds.left, y: event.detail ? event.clientY : bounds.bottom, heading: null, commands: targetCommands(async () => targets ?? [], "Annotate hunk…", tooMany ? `Annotate at most ${MAX_LINES} changed lines at a time` : targets?.length ? null : "The source of this hunk is unavailable") });
    }
</script>
<div class="range-hunk" role="group" aria-label={`Hunk at lines ${hunk.location.from_file.start} before and ${hunk.location.to_file.start} after`}>
    <span class="location">@@ −{hunk.location.from_file.start},{hunk.location.from_file.len} +{hunk.location.to_file.start},{hunk.location.to_file.len} @@</span>
    {#if hunk.provenance}<OriginLink origin={hunk.provenance.origin} {path} />{:else}<span>Origin unavailable</span>{/if}
    <button type="button" class="text-link" onclick={annotate}>Annotate hunk</button>
</div>
<style>
    .range-hunk { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); padding: var(--space-2); color: var(--muted); font: var(--font-label); }
    .location { font: var(--font-id); }
</style>
