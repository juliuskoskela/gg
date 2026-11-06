<script lang="ts">
    import { onDestroy, type Snippet } from "svelte";
    import ToolbarRow from "./ToolbarRow.svelte";
    import { toolbarOwner, useToolbars } from "../workspace/toolbars";

    export let children: Snippet;
    export let label = "View tools";
    export let local = false;
    let toolbars = useToolbars();
    let owner = toolbarOwner();
    let registered: Snippet | undefined;

    function contribute(content: Snippet, inline: boolean) {
        if (!toolbars || !owner) return;
        toolbars.update(current => {
            let next = new Map(current);
            if (inline) { if (next.get(owner!) === registered) next.delete(owner!); }
            else next.set(owner!, content);
            registered = inline ? undefined : content;
            return next;
        });
    }
    $: contribute(children, local);
    onDestroy(() => {
        if (toolbars && owner) toolbars.update(current => {
            if (current.get(owner!) !== registered) return current;
            let next = new Map(current); next.delete(owner!); return next;
        });
    });
</script>

{#if local || !toolbars || !owner}<ToolbarRow {label}>{@render children()}</ToolbarRow>{/if}
