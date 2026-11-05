<script lang="ts">
    export let label = "Revision metadata";
</script>

<dl class="metadata-list" aria-label={label}><slot /></dl>

<style>
    .metadata-list { display: grid; gap: 12px; margin: 0; min-width: 0; }
</style>
