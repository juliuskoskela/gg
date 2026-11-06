<script lang="ts">
    export let value = "";
    export let element: HTMLTextAreaElement | undefined = undefined;
    export let label: string | undefined = undefined;
    export let className = "";
</script>

<textarea
    {...$$restProps}
    class="text-area-field {className}"
    aria-label={label ?? $$restProps["aria-label"]}
    bind:this={element}
    bind:value
    on:input
    on:change
    on:keydown
    on:focus
    on:blur
    on:dragenter
    on:dragover
></textarea>

<style>
    .text-area-field::-webkit-scrollbar-corner { background-color: inherit; }
    .text-area-field::-webkit-resizer { background-color: inherit; background-image: linear-gradient(135deg, transparent 56%, var(--faint) 56% 61%, transparent 61% 74%, var(--faint) 74% 79%, transparent 79%); background-size: 9px 9px; background-position: center; background-repeat: no-repeat; }
    .text-area-field { box-sizing: border-box; min-width: 0; width: 100%; resize: vertical; line-height: var(--leading-body, 1.5); }
</style>
