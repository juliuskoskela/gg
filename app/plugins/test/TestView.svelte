<script lang="ts">
    import ViewToolbar from "../../controls/ViewToolbar.svelte";
    import type { PluginViewProps } from "../types";
    let { api }: PluginViewProps = $props();
</script>
<ViewToolbar label="Plugin tools"><button type="button" onclick={() => api.storage.set("clicked", true)}>Plugin action</button></ViewToolbar>
<p>Bundled plugin content</p>
