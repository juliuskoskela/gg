<script lang="ts">
    import { dragOverWidget } from "../stores";

    export let disabled = false;
    export let tip: string = "";
    export let onClick: (event: MouseEvent) => void;
</script>

<button type="button" {disabled} aria-label={tip || undefined} on:click|stopPropagation={onClick} on:dragenter={dragOverWidget} on:dragover={dragOverWidget} title={tip}>
    <slot />
</button>

<style>
    @import "./action.css";
</style>
