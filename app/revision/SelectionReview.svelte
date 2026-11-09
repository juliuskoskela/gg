<script lang="ts">
    import type { RevHeader } from "../messages/RevHeader";
    import ChangeReview from "./ChangeReview.svelte";
    let { headers, reason = "These changes have separate diffs." }: { headers: RevHeader[]; reason?: string } = $props();
</script>
<section class="selection-review" aria-label="Selected changes">
    <p class="selection-reason">{reason}</p>
    {#each headers as header, index (header.id.commit.hex)}<ChangeReview {header} initialOpen={index === 0} />{/each}
</section>
<style>
    .selection-review { flex: 1; min-height: 0; overflow: auto; pointer-events: auto; }
    .selection-reason { padding: var(--panel-inset); color: var(--muted); font: var(--font-body); }
</style>
