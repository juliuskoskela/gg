<script lang="ts">
    import type { RevChange } from "../messages/RevChange";
    interface Props {
        changes: RevChange[];
    }

    let { changes }: Props = $props();
    let added = $derived(changes.reduce((total, change) => total + (change.stat?.added ?? change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("+")).length, 0)), 0));
    let removed = $derived(changes.reduce((total, change) => total + (change.stat?.removed ?? change.hunks.reduce((count, hunk) => count + hunk.lines.lines.filter(line => line.startsWith("-")).length, 0)), 0));
</script>

<span class="diff-stat" aria-label={`Total diff: ${added} additions, ${removed} deletions`} title="Total changes across all files"><span class="added">+{added}</span><span class="removed">−{removed}</span></span>

<style>
    .diff-stat { display: inline-flex; align-items: baseline; flex-shrink: 0; gap: var(--panel-gap); font-size: var(--type-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .added { color: var(--positive); }
    .removed { color: var(--negative); }
</style>
