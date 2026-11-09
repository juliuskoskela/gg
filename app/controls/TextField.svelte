<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";
    interface Props extends Omit<HTMLInputAttributes, "value" | "type"> {
        value?: string;
        element?: HTMLInputElement | undefined;
        label?: string | undefined;
        type?: "text" | "search" | "email" | "url" | "tel" | "password";
        className?: string;
    }

    let {
        value = $bindable(""),
        element = $bindable(undefined),
        label = undefined,
        type = "text",
        className = "",
        ...rest
    }: Props = $props();
</script>

<input
    {...rest}
    class="text-field {className}"
    {type}
    aria-label={label ?? rest["aria-label"]}
    bind:this={element}
    bind:value
/>

<style>
    .text-field { box-sizing: border-box; min-width: 0; width: 100%; }
</style>
