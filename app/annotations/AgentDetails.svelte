<script lang="ts">
    import type { AnnotationMetadata } from "../messages/AnnotationMetadata";
    let { metadata }: { metadata?: AnnotationMetadata } = $props();
    let risk = $derived(metadata?.riskScore);
    let model = $derived(metadata?.onBehalfOf?.model);
    let levels = ["", "Low risk", "Typical risk", "High risk", "Very high risk"];
    let riskLabel = $derived(risk ? levels[risk.level] ?? "Unspecified risk" : "");
    let riskDetail = $derived(risk ? [`Agent-reported: ${riskLabel}`, ...(risk.explanations ?? []), ...(risk.sha ? [`Commit ${risk.sha}`] : [])].join("\n") : "");
</script>

{#if model}<span class="model" title={`Model reported by ${metadata?.onBehalfOf?.agent}`}>{model}</span>{/if}
{#if risk}<span class="risk" title={riskDetail} aria-label={`Agent-reported ${riskLabel.toLowerCase()}`}>{riskLabel}</span>{/if}

<style>
    .model { color: var(--muted); overflow-wrap: anywhere; }
    .risk { color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding-inline: var(--space-1); font: var(--font-label); }
</style>
