<script lang="ts">
    export let label: string;
    export let summaryVisible = true;
</script>

<div class="panel-tools" role="group" aria-label={label}>
    {#if summaryVisible && $$slots.summary}<div class="panel-tools-summary"><slot name="summary" /></div>{/if}
    <div class="panel-tools-controls"><slot /></div>
</div>

<style>
    .panel-tools { display: flex; align-items: center; justify-content: flex-end; flex-wrap: var(--panel-tools-wrap, wrap); gap: var(--panel-gap) var(--tool-group-gap); min-width: 0; width: 100%; pointer-events: auto; }
    .panel-tools-summary { display: flex; align-items: center; gap: var(--panel-gap); min-width: 0; margin-inline-end: auto; }
    .panel-tools-controls { display: flex; align-items: center; justify-content: flex-end; gap: var(--tool-group-gap); min-width: 0; max-width: 100%; margin-inline-start: auto; }
</style>
