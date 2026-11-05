<script lang="ts">
    import type { ChangeId } from "../messages/ChangeId";
    import type { CommitId } from "../messages/CommitId";
    import { currentTarget } from "../stores";
    export let id: ChangeId | CommitId;
    export let pronoun: boolean = false;
    export let selectable: boolean = false;

    $: suffix = id.rest.substring(0, 8 - id.prefix.length);
    $: category = id.type == "CommitId" ? "commit" : id.is_divergent ? "divergent" : id.offset ? "hidden" : "change";
</script>

<span title={id.type === "ChangeId" && id.is_divergent ? "Divergent change" : undefined} class="id" class:pronoun={pronoun || $currentTarget?.type == "Repository"} class:selectable>
    <span class="prefix {category}">{id.prefix}</span>{suffix}{#if id.type == "ChangeId" && id.offset}<span
            class="suffix {category}">/{id.offset}</span
        >{/if}{#if id.type === "ChangeId" && id.is_divergent}<span class="divergence" aria-label="Divergent change">≠</span>{/if}
</span>

<style>
    .id {
        pointer-events: none;
        color: var(--muted);
        font-family: var(--stack-code);
        font-size: var(--type-caption);
    }

    .commit {
        color: var(--muted);
    }

    .prefix:is(.change, .hidden, .divergent) { font-weight: 500; }

    .change {
        color: var(--text);
    }

    .hidden {
        color: var(--text);
    }

    .divergence { margin-inline-start: 2px; font-weight: 500; color: var(--negative); }

    .divergent {
        color: var(--negative);
    }

    .pronoun {
        color: inherit;
        pointer-events: none;
    }

    .pronoun > .prefix,
    .pronoun > .suffix {
        color: inherit;
        font-weight: 500;
    }

    .selectable {
        user-select: text;
        pointer-events: auto;
    }
</style>
