<script lang="ts">
    import type { Snippet } from "svelte";
    import { dragOverWidget } from "../stores";

    interface Props {
        disabled?: boolean;
        tip?: string;
        onClick: (event: MouseEvent) => void;
        children?: Snippet;
    }

    let {
        disabled = false,
        tip = "",
        onClick,
        children
    }: Props = $props();
</script>

<button type="button" {disabled} aria-label={tip || undefined} onclick={event => { event.stopPropagation(); onClick(event); }} ondragenter={dragOverWidget} ondragover={dragOverWidget} title={tip}>
    {@render children?.()}
</button>

<style>
    @import "./action.css";
</style>
