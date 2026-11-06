<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import { dock } from "../workspace/dock";
    import { tick } from "svelte";
    import Icon from "../controls/Icon.svelte";
    import RevisionOverview from "./RevisionOverview.svelte";
    async function openEvolution() { dock.open("evolution"); await tick(); document.getElementById("panel-tab-evolution")?.focus(); }
    export let revs: Extract<RevsResult, { type: "Detail" }>;
</script>

<aside class="overview" aria-label="Revision overview"><RevisionOverview {revs} />{#if revs.headers.length === 1}<div class="revision-history"><button type="button" on:click={openEvolution}><Icon name="rotate-ccw" />Evolution</button><span>Versions of this change</span></div>{/if}</aside>

<style>
    .revision-history { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 0 var(--panel-inset) 12px; font-size: var(--type-caption); color: var(--muted); }
    button { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 6px 8px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text); font-size: var(--type-ui); cursor: pointer; }
    @media (hover: hover) { button:hover { background: var(--interaction-hover); } }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
    .overview { container: overview / inline-size; flex-shrink: 0; min-width: 0; min-height: 0; }
</style>
