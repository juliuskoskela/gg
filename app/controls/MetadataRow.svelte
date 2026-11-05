<script lang="ts">
    export let label: string;
</script>

<div class="metadata-row"><dt>{label}</dt><dd><slot /></dd></div>

<style>
    .metadata-row { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: start; column-gap: 16px; min-width: 0; }
    dt { margin: 0; color: var(--muted); font-size: var(--type-ui); font-weight: 400; line-height: 1.6; }
    dd { margin: 0; min-width: 0; color: var(--text); font-size: var(--type-ui); line-height: 1.6; overflow-wrap: anywhere; }
    @media (max-width: 600px) { .metadata-row { grid-template-columns: 68px minmax(0, 1fr); column-gap: 12px; } }
    @container metadata (max-width: 320px) { .metadata-row { grid-template-columns: minmax(0, 1fr); gap: 3px; } dt { font-size: var(--type-caption); } }
</style>
