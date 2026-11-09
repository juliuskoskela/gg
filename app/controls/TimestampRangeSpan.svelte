<script lang="ts">
    interface Props {
        from: string;
        to: string;
    }

    let { from, to }: Props = $props();

    let fromDatetime = $derived(new Date(from));
    let toDatetime = $derived(new Date(to));

    const formatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short",
    });
</script>

<span class="timestamp" title={`${fromDatetime.toLocaleString()} - ${toDatetime.toLocaleString()}`}>
    {formatter.formatRange(fromDatetime, toDatetime)}
</span>

<style>
    .timestamp {
        color: var(--muted);
        font-size: var(--type-caption);
        white-space: nowrap;
        pointer-events: auto;
    }
</style>
