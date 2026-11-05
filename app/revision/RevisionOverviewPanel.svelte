<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import RevisionOverview from "./RevisionOverview.svelte";
    export let revs: Extract<RevsResult, { type: "Detail" }>;
</script>

<aside class="overview" aria-label="Revision overview"><RevisionOverview {revs} /></aside>

<style>
    .overview { container: overview / inline-size; flex-shrink: 0; min-width: 0; min-height: 0; }
</style>
