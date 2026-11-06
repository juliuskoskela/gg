<script lang="ts">
    export let label: string;
</script>

<div class="metadata-row"><dt>{label}</dt><dd><slot /></dd></div>

<style>
    /* rows lay out in their list's grid */
    .metadata-row { display: contents; }
    dt { margin: 0; color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    dd { margin: 0; min-width: 0; color: var(--text); font: var(--font-body); overflow-wrap: anywhere; }
    @container metadata (max-width: 300px) { dd { margin-block-end: var(--gap-group); } }
</style>
