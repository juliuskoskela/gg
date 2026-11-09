<script lang="ts">
    import ReviewControl from "../review/ReviewControl.svelte";
    import type { RevHeader } from "../messages/RevHeader";
    import type { RevChange } from "../messages/RevChange";
    import PanelTools from "../controls/PanelTools.svelte";
    import DiffStat from "./DiffStat.svelte";
    import DiffDisplayOptions from "./DiffDisplayOptions.svelte";
    interface Props {
        changes: RevChange[];
        title?: string;
        headers?: RevHeader[];
    }

    let { changes, title = "", headers = [] }: Props = $props();
</script>

<div class="diff-tools"><PanelTools label="Diff tools" summaryVisible={true}>
    {#snippet summary()}{#if title}<h3>{title}</h3>{/if}<DiffStat {changes} />{/snippet}
    {#if headers.length === 1}<ReviewControl header={headers[0]} />{/if}
    {#if changes.length}<DiffDisplayOptions />{/if}
</PanelTools></div>

<style>
    .diff-tools { min-width: 0; width: 100%; }
    h3 { margin: 0; font-size: var(--type-ui); font-weight: 500; }
</style>
