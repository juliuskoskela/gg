<script lang="ts">
    import type { RevId } from "../messages/RevId";
    import type { RevHeader } from "../messages/RevHeader";
    import { fileReviewState, reviewBusy, reviewError, reviewProgress, reviewsByChange, setReviewed } from "./progress";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import ReviewCount from "./ReviewCount.svelte";

    let { header, path = null, onCompare }: { header: RevHeader; path?: string | null; onCompare?: (from: RevId, to: RevId, path: string | null) => void } = $props();
    let change = $derived($reviewsByChange.get(header.id.change.hex));
    let reviewed = $derived(path !== null ? fileReviewState(header, path, $reviewProgress) === "reviewed" : (change?.reviewed_commit_id === header.id.commit.hex || !!change?.reviewed_commit_id && change.state === "reviewed" && change.commit_id === header.id.commit.hex));
    let reviewedCommit = $derived(path !== null ? change?.files.find(file => file.path === path)?.reviewed_commit_id : change?.reviewed_commit_id);
    let changed = $derived(!reviewed && change?.commit_id === header.id.commit.hex && !!reviewedCommit);
    function compare() {
        if (!reviewedCommit || !onCompare) return;
        let origin = path !== null ? change?.files.find(file => file.path === path)?.reviewed_change_id : undefined;
        let from = { ...header.id, change: { ...header.id.change, hex: origin ?? header.id.change.hex }, commit: { ...header.id.commit, hex: reviewedCommit, prefix: reviewedCommit, rest: "" } };
        onCompare(from, header.id, path);
    }
    let text = $derived(path !== null ? "File reviewed" : "Change reviewed");
</script>

<div class="review-control">
    {#if path === null}<ReviewCount {header} />{/if}
    <ToggleItem on={reviewed} disabled={$reviewBusy} icon="check" {text} label={`${reviewed ? "Unmark" : "Mark"} ${path !== null ? "file" : "change"} as reviewed`} tip={path !== null ? `${reviewed ? "Unmark" : "Mark"} ${path} as reviewed by you` : `${reviewed ? "Unmark" : "Mark"} all files as reviewed by you`} onClick={() => setReviewed(header, path, !reviewed)} />
    {#if changed && onCompare}<button class="text-link" type="button" onclick={compare}>Since review</button>{/if}
    {#if $reviewError}<span class="review-error" role="alert">{$reviewError}</span>{/if}
</div>

<style>
    .review-control { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--gap-row); font: var(--font-label); }
    .review-error { color: var(--negative); overflow-wrap: anywhere; }
</style>
