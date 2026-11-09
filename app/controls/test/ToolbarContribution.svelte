<script lang="ts">
    import { untrack } from "svelte";
    import { provideToolbarOwner } from "../../workspace/toolbars";
    import ViewToolbar from "../ViewToolbar.svelte";
    interface Props {
        id: string;
    }

    let { id }: Props = $props();
    let count = $state(0);
    provideToolbarOwner(untrack(() => id));
</script>

<ViewToolbar><button type="button" onclick={() => count++}>{id === "plugin" ? `Count ${count}` : "Other action"}</button></ViewToolbar>
