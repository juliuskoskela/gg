<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        tone?: "default" | "muted" | "warning";
        children?: Snippet;
    }

    let { tone = "default", children }: Props = $props();
</script>

<!-- badges read like the annotations' counts: small ink pills, quiet unless they warn -->
<span class="badge {tone}">{@render children?.()}</span>

<style>
    .badge { display: inline-flex; flex: none; align-items: center; align-self: center; padding: 0 var(--control-gap); border-radius: var(--radius-control); background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); font: var(--font-label); white-space: nowrap; }
    .muted { background: transparent; color: var(--muted); }
    .warning { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
</style>
