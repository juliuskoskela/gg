<script lang="ts">
    export let value = "";
    export let element: HTMLInputElement | undefined = undefined;
    export let label: string | undefined = undefined;
    export let type: "text" | "search" | "email" | "url" | "tel" | "password" = "text";
    export let className = "";
</script>

<input
    {...$$restProps}
    class="text-field {className}"
    {type}
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
/>

<style>
    .text-field { box-sizing: border-box; min-width: 0; width: 100%; }
</style>
