<script lang="ts">
    import type { RevHeader } from "../messages/RevHeader";
    import { reviewsByChange } from "./progress";
    let { header }: { header: RevHeader } = $props();
    let change = $derived($reviewsByChange.get(header.id.change.hex));
    let gone = $derived(change?.files.filter(file => file.state === "gone").length ?? 0);
</script>

{#if change && change.commit_id === header.id.commit.hex}<span class="review-count" title={change.state === "reviewed" ? "Reviewed by you" : `Your review progress${gone ? `; ${gone} previously reviewed files no longer change` : ""}`} aria-label={`${change.reviewed} of ${change.total} files reviewed by you${gone ? `, ${gone} previously reviewed files no longer change` : ""}`}>✓ {change.reviewed}/{change.total}{#if gone} · {gone} gone{/if}</span>{/if}

<style>
    .review-count { flex: none; white-space: nowrap; color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; }
</style>
