<script lang="ts">
    import { provideToolbarOwner } from "../controls/toolbars";
    import ViewToolbar from "../controls/ViewToolbar.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";

    let { local = false }: { local?: boolean } = $props();
    let wrap = $state(true);
    let metadata = $state(true);
    provideToolbarOwner("toolbar-example");
</script>

<ViewToolbar label="Example view tools" {local}>
    <ToggleTray label="Example line wrapping"><ToggleItem icon="corner-down-left" text="Wrap" label="Wrap toolbar example" on={wrap} onClick={() => wrap = !wrap} /></ToggleTray>
</ViewToolbar>
<ViewToolbar label="Example view tools" {local}>
    <ToggleTray label="Example metadata"><ToggleItem icon="info" text="Metadata" label="Show toolbar example metadata" on={metadata} onClick={() => metadata = !metadata} /></ToggleTray>
</ViewToolbar>
