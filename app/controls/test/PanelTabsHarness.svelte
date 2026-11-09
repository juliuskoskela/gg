<script lang="ts">
    import PanelTabs from "../PanelTabs.svelte";
    interface Props {
        items?: any;
        draggable?: boolean;
    }

    let { items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }], draggable = false }: Props = $props();
</script>

<PanelTabs {items} active="diff" {draggable} onSelect={() => {}} onClose={() => {}}>
    {#snippet tools()}<button type="button">Wrap lines</button>{/snippet}
</PanelTabs>
