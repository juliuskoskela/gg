<script lang="ts">
    import { untrack } from "svelte";
    import { provideToolbarOwner } from "../toolbars";
    import ViewToolbar from "../ViewToolbar.svelte";
    interface Props {
        id: string;
        extra?: boolean;
        local?: boolean;
    }

    let { id, extra = false, local = false }: Props = $props();
    let count = $state(0);
    provideToolbarOwner(untrack(() => id));
</script>

<ViewToolbar {local}><button type="button" onclick={() => count++}>{extra ? "Extra action" : id === "plugin" ? `Count ${count}` : "Other action"}</button></ViewToolbar>
