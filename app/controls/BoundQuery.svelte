<!--
@component
Abstraction of dubious utility - it's only used in one place, because most IPC does not follow a query-like pattern.
-->

<script lang="ts" generics="T">
    import type { Snippet } from "svelte";
    import type { Query as Query } from "../ipc";

    interface Props {
        query: Query<T>;
        wait?: Snippet;
        error?: Snippet<[{ message: string }]>;
        children?: Snippet<[{ data: T }]>;
    }

    let {
        query,
        wait,
        error,
        children
    }: Props = $props();

</script>

{#if query.type == "wait"}
    {@render wait?.()}
{:else if query.type == "error"}
    {#if error}{@render error({ message: query.message })}{:else}<span class="red">{query.message}</span>{/if}
{:else}
    {@render children?.({ data: query.value })}
{/if}

<style>
    .red {
        color: var(--negative);
    }
</style>
