<script lang="ts">
    import PanelTools from "../controls/PanelTools.svelte";
    import OptionsMenu from "../controls/OptionsMenu.svelte";
    import { historyDensity } from "../graphLayout";
    import { timelineDisplay } from "./display";
</script>

<PanelTools label="Timeline tools">
    <OptionsMenu label="Timeline display" icon="eye" options={[
        { id: "authors", label: "Authors", group: 0, checked: $historyDensity === "tall", onToggle: () => historyDensity.set($historyDensity === "tall" ? "compact" : "tall") },
        { id: "change", label: "Change IDs", group: 1, checked: $timelineDisplay.change, onToggle: () => timelineDisplay.toggle("change") },
        { id: "commit", label: "Commit IDs", group: 1, checked: $timelineDisplay.commit, onToggle: () => timelineDisplay.toggle("commit") },
        { id: "bookmarks", label: "Bookmarks", group: 2, checked: $timelineDisplay.bookmarks, onToggle: () => timelineDisplay.toggle("bookmarks") },
        { id: "tags", label: "Tags", group: 2, checked: $timelineDisplay.tags, onToggle: () => timelineDisplay.toggle("tags") },
    ]} />
</PanelTools>
