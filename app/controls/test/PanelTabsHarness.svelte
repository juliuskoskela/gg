<script lang="ts">
    import PanelTabs from "../PanelTabs.svelte";
    export let items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }];
    export let draggable = false;
</script>

<PanelTabs {items} active="diff" {draggable} onSelect={() => {}} onClose={() => {}}>
    {#snippet tools()}<button type="button">Wrap lines</button>{/snippet}
</PanelTabs>
