<script lang="ts">
    import { dragOverWidget } from "../stores";

    interface Props {
        id?: string | null;
        checked: boolean;
    }

    let { id = null, checked = $bindable() }: Props = $props();
</script>

<input {id} type="checkbox" bind:checked ondragenter={dragOverWidget} ondragover={dragOverWidget} />

<style>
    input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }
</style>
