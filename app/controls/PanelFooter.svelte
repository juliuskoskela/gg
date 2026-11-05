<script lang="ts">
    export let className = "";
</script>

<footer class="panel-footer {className}"><slot /></footer>

<style>
    .panel-footer {
        display: flex;
        align-items: center;
        flex: none;
        min-width: 0;
        height: 49px;
        min-height: 49px;
        padding: 8px var(--pane-inset);
        background: var(--panel-header-bg);
        border-top: 1px solid var(--rule);
    }

    .panel-footer > :global(*) {
        flex: 1;
        min-width: 0;
    }

    @media (pointer: coarse), (max-width: 600px) {
        .panel-footer { height: 61px; min-height: 61px; }
    }
</style>
