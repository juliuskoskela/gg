<script lang="ts">
    import type { RevChange } from "../messages/RevChange";
    import { lineCounts } from "./fileCategories";
    interface Props { changes: RevChange[]; }
    let { changes }: Props = $props();
    let incomplete = $derived(changes.some(change => change.has_conflict || !change.stat && !change.hunks.length && change.kind !== "None"));
    let counts = $derived(lineCounts(changes));
    let different = $derived(counts.added !== counts.totalAdded || counts.removed !== counts.totalRemoved);
    let description = $derived(`Implementation: ${counts.added} additions, ${counts.removed} deletions${different ? `. All files: ${counts.totalAdded} additions, ${counts.totalRemoved} deletions` : ""}`);
</script>

{#if incomplete}<span class="diff-stat unavailable" title="Line counts unavailable for binary or very large changes" aria-label="Line counts unavailable">—</span>{:else}<span class="diff-stat" aria-label={description} title={description}><span class="added">+{counts.added}</span><span class="removed">−{counts.removed}</span>{#if different}<span class="all-files" aria-hidden="true">*</span>{/if}</span>{/if}

<style>
    .diff-stat { display: inline-flex; align-items: baseline; flex-shrink: 0; gap: var(--panel-gap); font: var(--font-label); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .unavailable { color: var(--muted); }
    .added { color: var(--positive); }
    .removed { color: var(--negative); }
    .all-files { color: var(--muted); }
</style>
