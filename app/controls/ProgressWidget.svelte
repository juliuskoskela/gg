<script lang="ts">
    export let label: string = "Working…";
    export let value: number | undefined = undefined;
</script>

<div class="progress-bar">
    {#if value !== undefined}
        <progress aria-label={label} {value} max={100}></progress>
    {:else}
        <progress aria-label={label}></progress>
    {/if}
    <p class="progress-label">{label}</p>
</div>

<style>
    .progress-bar { display: grid; gap: 12px; width: 100%; min-width: 0; }
    .progress-label { font-size: var(--type-ui); color: var(--text); }
    progress { width: min(460px, 100%); height: 6px; appearance: none; border: 0; border-radius: 4px; overflow: hidden; background: var(--active); }
    progress::-webkit-progress-bar { background: var(--active); border-radius: 4px; }
    progress::-webkit-progress-value { background: var(--control); border-radius: 4px; }
    progress::-moz-progress-bar { background: var(--control); border-radius: 4px; }
    progress:indeterminate { animation: working 1.5s ease-in-out infinite alternate; background: var(--control); }
    @keyframes working { from { opacity: .45; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { progress:indeterminate { animation: none; } }
</style>
