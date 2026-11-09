<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import { dock } from "../workspace/dock";
    import { tick } from "svelte";
    import Icon from "../controls/Icon.svelte";
    import RevisionOverview from "./RevisionOverview.svelte";
    async function openEvolution() { dock.open("evolution"); await tick(); document.getElementById("panel-tab-evolution")?.focus(); }
    interface Props {
        revs: Extract<RevsResult, { type: "Detail" }>;
    }

    let { revs }: Props = $props();
</script>

<aside class="overview" aria-label="Revision overview"><RevisionOverview {revs} />{#if revs.headers.length === 1}<div class="revision-history"><button type="button" class="text-link" onclick={openEvolution}><Icon name="rotate-ccw" />Earlier versions of this change</button></div>{/if}</aside>

<style>
    .revision-history { padding: 0 var(--panel-inset) 14px; }
    .overview { container: overview / inline-size; flex-shrink: 0; min-width: 0; min-height: 0; }
</style>
