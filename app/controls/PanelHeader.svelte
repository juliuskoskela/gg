<script lang="ts">
    export let className = "";
    export let label: string | undefined = undefined;
</script>

<div class="panel-header {className}" aria-label={label}><slot /></div>

<style>
    .panel-header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--panel-gap) var(--tool-group-gap); flex-shrink: 0; min-width: 0; min-height: var(--panel-toolbar-height); padding: var(--panel-bar-padding) var(--panel-inset); background: var(--panel-header-bg); border-block-end: 1px solid var(--rule); }
</style>
