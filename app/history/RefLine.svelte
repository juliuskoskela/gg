<script lang="ts">
    import Chip from "../controls/Chip.svelte";
    import Icon from "../controls/Icon.svelte";
    interface Props {
        kind: "workspace" | "bookmark";
        name: string;
        /** commit ids the reference points at */
        ids?: string[];
        /** ids that were removed from the reference in this operation */
        removed?: string[];
        conflicted?: boolean;
        /** whether a commit can be opened; unavailable ids render as plain text */
        available?: (id: string) => boolean;
        onInspect?: ((id: string) => void) | undefined;
    }

    let { kind, name, ids = [], removed = [], conflicted = false, available = () => true, onInspect = undefined }: Props = $props();
</script>

<div class="ref-line" role="listitem">
    <span class="lead">
        <Chip tone={kind} context={false} target={false} immobile tip={kind === "workspace" ? `workspace: ${name}` : `bookmark: ${name}`}>
            <Icon name={kind === "workspace" ? "at-sign" : "bookmark"} />
            <span class="name">{name}</span>
        </Chip>
    </span>
    <span class="trail">
        {#if conflicted}<span class="conflicted">Conflicted</span>{/if}
        {#each removed as id}<s class="removed" title="Removed {id}">{id.slice(0, 8)}</s>{/each}
        {#each ids as id}
            {#if onInspect && available(id)}<button type="button" class="text-link id" title={id} onclick={() => onInspect(id)}>{id.slice(0, 8)}</button>
            {:else}<span class="id unavailable" title={id}>{id.slice(0, 8)}</span>{/if}
        {/each}
    </span>
</div>

<style>
    .ref-line { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 28px; min-width: 0; }
    .lead { display: flex; min-width: 0; }
    .lead :global(.chip) { max-width: 100%; }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .trail { display: flex; flex: none; align-items: center; gap: var(--space-2); }
    .id { font: var(--font-id); font-variant-ligatures: none; }
    .unavailable, .removed { color: var(--muted); }
    .removed { text-decoration: line-through; font: var(--font-id); }
    .conflicted { color: var(--warning); font: var(--font-label); }
    .text-link.id { min-height: 28px; }
    @media (pointer: coarse), (max-width: 600px) { .ref-line, .text-link.id { min-height: 44px; } }
</style>
