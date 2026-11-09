<script lang="ts">
    import Markdown from "../../annotations/Markdown.svelte";
    let { label, posts }: { label: string; posts: { id: string; author: string; at: string; body: string }[] } = $props();
    let expanded = $state(false);
</script>
<details bind:open={expanded}>
    <summary>{label}</summary>
    {#if expanded}
        {#each posts as post (post.id)}<article><h5>{post.author} · {post.at}</h5><Markdown source={post.body} /></article>{/each}
    {/if}
</details>
<style>
    details { border-block-start: 1px solid var(--rule); padding-block: var(--space-2); }
    summary { cursor: pointer; pointer-events: auto; font: var(--font-body); overflow-wrap: anywhere; }
    article { display: grid; gap: var(--gap-row); padding-block: var(--space-2); }
    h5 { font: var(--font-emphasis); margin: 0; overflow-wrap: anywhere; }
</style>
