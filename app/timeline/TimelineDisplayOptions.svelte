<script lang="ts">
    import PanelTools from "../controls/PanelTools.svelte";
    import OptionsMenu from "../controls/OptionsMenu.svelte";
    import { historyDensity } from "../graphLayout";
    import { timelineIds } from "./display";
</script>

<PanelTools label="Timeline tools">
    <OptionsMenu label="Timeline display" icon="eye" options={[
        { id: "authors", label: "Authors", checked: $historyDensity === "tall", onToggle: () => historyDensity.set($historyDensity === "tall" ? "compact" : "tall") },
        { id: "change", label: "Change IDs", checked: $timelineIds.change, onToggle: () => timelineIds.toggle("change") },
        { id: "commit", label: "Commit IDs", checked: $timelineIds.commit, onToggle: () => timelineIds.toggle("commit") },
    ]} />
</PanelTools>
