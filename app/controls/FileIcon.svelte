<script lang="ts">
    import { fileIconName, fileIconUrl } from "./fileIcons";
    export let path: string;
    $: icon = fileIconName(path);
    $: source = fileIconUrl(path);
</script>

<img class="file-icon" src={source} data-file-icon={icon} alt="" aria-hidden="true" draggable="false" width="18" height="18" />

<style>
    .file-icon { display: block; inline-size: var(--file-icon-size, 18px); block-size: var(--file-icon-size, 18px); object-fit: contain; flex: 0 0 auto; pointer-events: none; }
</style>
