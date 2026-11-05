<script lang="ts">
    export let label: string;
</script>

<div class="metadata-row"><dt>{label}</dt><dd><slot /></dd></div>

<style>
    .metadata-row { display: grid; grid-template-columns: calc(var(--type-ui) * 80 / 13) minmax(0, 1fr); align-items: start; column-gap: calc(var(--type-ui) * 16 / 13); min-width: 0; }
    dt { margin: 0; color: var(--muted); font-size: var(--type-ui); font-weight: 400; line-height: 1.6; overflow-wrap: anywhere; }
    dd { margin: 0; min-width: 0; color: var(--text); font-size: var(--type-ui); line-height: 1.6; overflow-wrap: anywhere; }
    @media (max-width: 600px) { .metadata-row { grid-template-columns: calc(var(--type-ui) * 68 / 14) minmax(0, 1fr); column-gap: calc(var(--type-ui) * 12 / 14); } }
    @container metadata (max-width: 320px) { .metadata-row { grid-template-columns: minmax(0, 1fr); gap: 3px; } dt { font-size: var(--type-caption); } }
</style>
