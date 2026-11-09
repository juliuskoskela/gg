<script lang="ts">
    import { untrack } from "svelte";
    import { onDestroy, type Snippet } from "svelte";
    import ToolbarRow from "./ToolbarRow.svelte";
    import { toolbarOwner, useToolbars } from "../workspace/toolbars";

    interface Props {
        children: Snippet;
        label?: string;
        local?: boolean;
    }

    let { children, label = "View tools", local = false }: Props = $props();
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
    $effect.pre(() => {
        let content = children, inline = local;
        untrack(() => contribute(content, inline));
    });
    onDestroy(() => {
        if (toolbars && owner) toolbars.update(current => {
            if (current.get(owner!) !== registered) return current;
            let next = new Map(current); next.delete(owner!); return next;
        });
    });
</script>

{#if local || !toolbars || !owner}<ToolbarRow {label}>{@render children()}</ToolbarRow>{/if}
