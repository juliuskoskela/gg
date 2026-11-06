<script lang="ts">
    import { provideToolbarOwner } from "../../workspace/toolbars";
    import ViewToolbar from "../ViewToolbar.svelte";
    export let id: string;
    let count = 0;
    provideToolbarOwner(id);
</script>

<ViewToolbar><button type="button" on:click={() => count++}>{id === "plugin" ? `Count ${count}` : "Other action"}</button></ViewToolbar>
