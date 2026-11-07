<script lang="ts">
    import type { ChangeId } from "../messages/ChangeId";
    import type { CommitId } from "../messages/CommitId";
    import { currentTarget } from "../stores";
    import { tooltip } from "./tooltip";
    export let id: ChangeId | CommitId;
    export let pronoun: boolean = false;
    export let selectable: boolean = false;

    $: suffix = id.rest.substring(0, 8 - id.prefix.length);
    $: category = id.type == "CommitId" ? "commit" : id.is_divergent ? "divergent" : id.offset ? "hidden" : "change";
    $: details = id.type === "CommitId"
        ? { label: "Commit ID", value: id.hex, description: "Identifies this exact snapshot, parents and metadata. Changes when rewritten." }
        : { label: id.is_divergent ? "Divergent change ID" : "Change ID", value: id.hex,
            description: id.is_divergent ? `Multiple visible commits share this change ID. Use a commit ID or change offset /${id.offset ?? 0} to select one version.`
                : "Identifies the logical change across edits and rebases. Stays the same when rewritten." };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (selectable identifiers expose the full ID on keyboard focus) -->
<span use:tooltip={details} title="" tabindex={selectable ? 0 : undefined} class="id" class:pronoun={pronoun || $currentTarget?.type == "Repository"} class:selectable>
    <span class="prefix {category}">{id.prefix}</span>{suffix}{#if id.type == "ChangeId" && id.offset}<span
            class="suffix {category}">/{id.offset}</span
        >{/if}{#if id.type === "ChangeId" && id.is_divergent}<span class="divergence" aria-label="Divergent change">≠</span>{/if}
</span>

<style>
    .id {
        pointer-events: auto;
        color: var(--muted);
        font: var(--font-id);
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
