<script lang="ts">
    import PanelGroup from "../PanelGroup.svelte";
    import PanelTabs from "../PanelTabs.svelte";
    import ToolbarContribution from "./ToolbarContribution.svelte";
    let active = $state("plugin");
    let enabled = $state(true);
</script>

<PanelGroup>
    <PanelTabs items={[{ id: "plugin", label: "Plugin" }, { id: "other", label: "Other" }]} {active} onSelect={id => active = id} />
    {#if enabled}<ToolbarContribution id="plugin" />{/if}
    <ToolbarContribution id="other" />
</PanelGroup>
<button type="button" onclick={() => enabled = false}>Disable extension</button>
