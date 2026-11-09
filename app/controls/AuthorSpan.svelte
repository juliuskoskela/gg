<script lang="ts">
    import type { RevAuthor } from "../messages/RevAuthor";
    interface Props {
        author: RevAuthor;
    }

    let { author }: Props = $props();
</script>

<span class="author" title={author.email}>
    {author.name}
</span>

<style>
    .author {
        color: var(--muted);
        white-space: nowrap;
        pointer-events: auto;
    }
</style>
