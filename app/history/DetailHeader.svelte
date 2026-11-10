<script lang="ts">
    import Badge from "../controls/Badge.svelte";
    interface Props {
        title: string;
        /** status pills shown under the title */
        pills?: { label: string; tone?: "default" | "muted" | "warning" }[];
    }

    let { title, pills = [] }: Props = $props();
</script>

<header class="detail-header">
    <h2>{title}</h2>
    {#if pills.length}<div class="status" role="list" aria-label="Status">{#each pills as pill}<span role="listitem"><Badge tone={pill.tone ?? "default"}>{pill.label}</Badge></span>{/each}</div>{/if}
</header>

<style>
    .detail-header { min-width: 0; margin: 0; }
    h2 { margin: 0; color: var(--text-strong); font: var(--font-title); overflow-wrap: anywhere; }
    /* a pill with no fill would look indented from the title */
    .status :global(.badge.muted) { background: color-mix(in srgb, var(--text) 5%, transparent); }
    .status { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-block-start: var(--space-2); }
</style>
