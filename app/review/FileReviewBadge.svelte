<script lang="ts">
    import Icon from "../controls/Icon.svelte";
    import type { RevHeader } from "../messages/RevHeader";
    import { fileReviewState, reviewProgress } from "./progress";
    let { header, path }: { header: RevHeader; path: string } = $props();
    let state = $derived(fileReviewState(header, path, $reviewProgress));
    let label = $derived(state === "reviewed" ? "Reviewed by you" : state === "changed" ? "Changed since your review" : "No longer part of this change");
</script>

{#if state}<span class="review-state" role="img" aria-label={label} title={label}><Icon name={state === "reviewed" ? "check" : state === "changed" ? "refresh-cw" : "minus"} /></span>{/if}

<style>
    .review-state { display: inline-flex; flex: none; color: var(--muted); --icon-size: var(--space-4); }
</style>
