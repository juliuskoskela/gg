<script lang="ts">
    import { tick } from "svelte";
    import { fileTreeVisible, mobileFilesVisible } from "../stores";
    import PanelToggle from "../controls/PanelToggle.svelte";
    export let disabled = false;
    let viewportWidth = 1440;
    $: visible = viewportWidth < 768 ? $mobileFilesVisible : $fileTreeVisible;
    function toggle() {
        let opening = !visible;
        if (viewportWidth < 768) mobileFilesVisible.update(value => !value);
        else fileTreeVisible.update(value => !value);
        if (opening) tick().then(() => document.querySelector<HTMLInputElement>('#changed-files input')?.focus());
    }
</script>

<svelte:window bind:innerWidth={viewportWidth} />
<PanelToggle label={visible && !disabled ? "Hide changed files" : "Show changed files"} controls="changed-files" side="trailing" text="Files" expanded={visible && !disabled} {disabled} onToggle={toggle} />
