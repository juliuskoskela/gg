<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import IdSpan from "../controls/IdSpan.svelte";
    import SetSpan from "../controls/SetSpan.svelte";
    import RevisionActions from "../RevisionActions.svelte";
    export let revs: Extract<RevsResult, { type: "Detail" }>;
    let width = 1000;
    $: singleton = revs.headers.length === 1;
    $: newest = revs.headers[0];
    $: undescribed = singleton && !newest.is_working_copy && !newest.description.lines[0];
    $: title = singleton ? (newest.is_working_copy ? "Working copy" : newest.description.lines[0] || "(no description set)") : `${revs.headers.length} revisions`;
</script>

<div class="revision-heading" bind:clientWidth={width}>
    <div class="revision-identity">
        <h2 class:description={singleton} class:undescribed tabindex="-1" title={title}>{title}</h2>
        <span class="revision-id">{#if singleton}<IdSpan selectable id={newest.id.change} />{:else}<SetSpan selectable set={revs.set} />{/if}</span>
        {#if revs.headers.some(header => header.is_immutable)}<span class="immutable-state">Immutable</span>{/if}
    </div>
    <RevisionActions headers={revs.headers} hasChanges={revs.changes.length + revs.conflicts.length > 0} compact={width < 700} />
</div>

<style>
    .revision-heading { display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; }
    .revision-identity { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; }
    h2 { flex: 1; min-width: 0; margin: 0; font-size: var(--type-ui); font-weight: 500; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    h2.description { font-size: var(--type-title); }
    h2.undescribed { font-size: var(--type-ui); font-weight: 400; color: var(--muted); }
    .revision-heading :global(.revision-actions) { width: auto; flex-shrink: 0; }
    .revision-id, .immutable-state { flex-shrink: 0; white-space: nowrap; font-size: var(--type-caption); color: var(--muted); }
    @media (max-width: 600px) { .revision-id, .immutable-state { display: none; } }
</style>
