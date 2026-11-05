<script lang="ts">
    import ProgressWidget from "../controls/ProgressWidget.svelte";
    import type { ProgressEvent } from "../messages/ProgressEvent";

    export let progress: ProgressEvent | undefined;

    let label = "Working…";
    let value: number | undefined = undefined;

    $: if (progress) {
        if (progress.type === "Progress") {
            value = progress.overall_percent;
        } else if (progress.type === "Message") {
            label = progress.text;
        }
    }
</script>

<div id="progress-chrome" role="status" aria-live="polite">
    <ProgressWidget {label} {value} />
</div>

<style>
    #progress-chrome {
        grid-area: 2/2/2/2;
        width: min(300px, calc(100vw - 32px));
        padding: 20px;
        background: var(--surface);
        border: 1px solid var(--rule);
        border-radius: var(--radius-control);
    }
</style>
