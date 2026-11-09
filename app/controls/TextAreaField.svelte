<script lang="ts">
    import type { HTMLTextareaAttributes } from "svelte/elements";
    interface Props extends Omit<HTMLTextareaAttributes, "value"> {
        value?: string;
        element?: HTMLTextAreaElement | undefined;
        label?: string | undefined;
        className?: string;
    }

    let {
        value = $bindable(""),
        element = $bindable(undefined),
        label = undefined,
        className = "",
        ...rest
    }: Props = $props();
</script>

<textarea
    {...rest}
    class="text-area-field {className}"
    aria-label={label ?? rest["aria-label"]}
    bind:this={element}
    bind:value
></textarea>

<style>
    .text-area-field::-webkit-scrollbar-corner { background-color: inherit; }
    .text-area-field::-webkit-resizer { background-color: inherit; background-image: linear-gradient(135deg, transparent 56%, var(--faint) 56% 61%, transparent 61% 74%, var(--faint) 74% 79%, transparent 79%); background-size: 9px 9px; background-position: center; background-repeat: no-repeat; }
    .text-area-field { box-sizing: border-box; min-width: 0; width: 100%; resize: vertical; line-height: var(--leading-body, 1.5); }
</style>
