<script lang="ts">
    import { diffStyle, diffWrap, diffFullContext } from "../stores";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";

    let layouts: { value: "auto" | "split" | "unified"; label: string; icon: string }[] = [
        { value: "auto", label: "Automatic", icon: "layout" },
        { value: "split", label: "Side by side", icon: "columns" },
        { value: "unified", label: "Stacked", icon: "align-justify" },
    ];
</script>

<div class="display-options">
    <ToggleTray label="Diff visibility" mode="multi">
        <ToggleItem icon="eye-off" label="Hide unmodified lines" on={!$diffFullContext} onClick={() => diffFullContext.update(value => !value)} />
        <ToggleItem icon="corner-down-left" label="Wrap lines" on={$diffWrap} onClick={() => diffWrap.update(value => !value)} />
    </ToggleTray>
    <ToggleTray label="Diff layout">
        {#each layouts as layout}
            <ToggleItem icon={layout.icon} label={layout.label} on={$diffStyle === layout.value} onClick={() => diffStyle.set(layout.value)} />
        {/each}
    </ToggleTray>
</div>

<style>
    .display-options { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--tool-group-gap); max-width: 100%; margin-inline-start: auto; }
</style>
