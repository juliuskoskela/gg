<script lang="ts">
    import ReviewControl from "../review/ReviewControl.svelte";
    import type { CompareReview } from "../review/comparison";
    import type { RevHeader } from "../messages/RevHeader";
    import type { RevChange } from "../messages/RevChange";
    import PanelTools from "../controls/PanelTools.svelte";
    import DiffStat from "./DiffStat.svelte";
    import DiffDisplayOptions from "./DiffDisplayOptions.svelte";
    interface Props {
        changes: RevChange[];
        title?: string;
        headers?: RevHeader[];
        onCompare?: CompareReview;
        /** the changed-files pane can be moved around the diff, which compact views do not have */
        placement?: boolean;
    }

    let { changes, title = "", headers = [], onCompare, placement = false }: Props = $props();
</script>

<div class="diff-tools"><PanelTools label="Diff tools" summaryVisible={true}>
    {#snippet summary()}{#if title}<h3>{title}</h3>{/if}<DiffStat {changes} />{/snippet}
    {#if headers.length === 1}<ReviewControl header={headers[0]} {onCompare} />{/if}
    {#if changes.length}<DiffDisplayOptions {placement} />{/if}
</PanelTools></div>

<style>
    .diff-tools { min-width: 0; width: 100%; }
    h3 { margin: 0; font-size: var(--type-ui); font-weight: 500; }
</style>
