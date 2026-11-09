<script lang="ts">
    import { untrack } from "svelte";
    import { onDestroy, type Snippet } from "svelte";
    import ToolbarRow from "./ToolbarRow.svelte";
    import { toolbarOwner, useToolbars } from "./toolbars";

    interface Props {
        children: Snippet;
        label?: string;
        local?: boolean;
    }

    let { children, label = "View tools", local = false }: Props = $props();
    let toolbars = useToolbars();
    let owner = toolbarOwner();
    let contribution = toolbars && owner ? toolbars.contribute(owner) : undefined;

    $effect.pre(() => {
        let content = children, inline = local;
        untrack(() => contribution?.update(inline ? undefined : content));
    });
    onDestroy(() => contribution?.dispose());
</script>

{#if local || !toolbars || !owner}<ToolbarRow {label}>{@render children()}</ToolbarRow>{/if}
