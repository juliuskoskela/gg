<script lang="ts">
    import type { RevChange } from "../messages/RevChange";
    import PanelTools from "../controls/PanelTools.svelte";
    import DiffDisplayOptions from "./DiffDisplayOptions.svelte";
    interface Props {
        changes: RevChange[];
        title?: string;
    }

    let { changes, title = "" }: Props = $props();
</script>

<div class="diff-tools"><PanelTools label="Diff tools" summaryVisible={!!title}>
    <svelte:fragment slot="summary">{#if title}<h3>{title}</h3>{/if}</svelte:fragment>
    {#if changes.length}<DiffDisplayOptions />{/if}
</PanelTools></div>

<style>
    .diff-tools { min-width: 0; width: 100%; }
    h3 { margin: 0; font-size: var(--type-ui); font-weight: 500; }
</style>
