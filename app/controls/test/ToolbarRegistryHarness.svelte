<script lang="ts">
    import PanelGroup from "../PanelGroup.svelte";
    import PanelTabs from "../PanelTabs.svelte";
    import ToolbarContribution from "./ToolbarContribution.svelte";
    let active = "plugin";
    let enabled = true;
</script>

<PanelGroup>
    <PanelTabs items={[{ id: "plugin", label: "Plugin" }, { id: "other", label: "Other" }]} {active} onSelect={id => active = id} />
    {#if enabled}<ToolbarContribution id="plugin" />{/if}
    <ToolbarContribution id="other" />
</PanelGroup>
<button type="button" on:click={() => enabled = false}>Disable extension</button>
