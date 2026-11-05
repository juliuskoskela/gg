<script lang="ts">
    import PanelTools from "../controls/PanelTools.svelte";
    import { historyDensity } from "../graphLayout";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
</script>

<PanelTools label="Timeline tools"><ToggleTray label="Timeline density"><ToggleItem icon="list" label="Tall revisions" tip={$historyDensity === "tall" ? "Hide revision authors" : "Show revision authors"} on={$historyDensity === "tall"} onClick={() => historyDensity.set($historyDensity === "tall" ? "compact" : "tall")} /></ToggleTray></PanelTools>
