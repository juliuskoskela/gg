<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import { revisionStatuses, bookmarkStatus } from "../revisionStatus";
    import MetadataList from "../controls/MetadataList.svelte";
    import MetadataRow from "../controls/MetadataRow.svelte";
    import AuthorSpan from "../controls/AuthorSpan.svelte";
    import TimestampSpan from "../controls/TimestampSpan.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import BookmarkObject from "../objects/BookmarkObject.svelte";
    import TagObject from "../objects/TagObject.svelte";
    import RevisionObject from "../objects/RevisionObject.svelte";
    import Zone from "../objects/Zone.svelte";
    import { targetsFor } from "../annotations/anchors";
    import { targetCommands } from "../annotations/commands";
    import { lineMenu } from "../annotations/store";
    import { revisionIdCommands } from "../commands/revisionIds";

    interface Props {
        revs: Extract<RevsResult, { type: "Detail" }>;
    }

    let { revs }: Props = $props();
    let singleton = $derived(revs.headers.length === 1);
    let newest = $derived(revs.headers[0]);
    let oldest = $derived(revs.headers[revs.headers.length - 1]);
    let authors = $derived([...new Map(revs.headers.map(header => [header.author.email, header.author])).values()]);
    let statuses = $derived(revs.headers.flatMap(header => revisionStatuses(header).map(status => ({ header, status }))));
    let references = $derived(revs.headers.flatMap(header => header.refs.map(ref => ({ header, ref }))));
    let bookmarks = $derived(references.filter(item => item.ref.type !== "Tag"));
    let tags = $derived(references.filter(item => item.ref.type === "Tag"));

    // ids are where people point when they talk about a revision, so they offer annotating and copying
    function idMenu(event: MouseEvent) {
        let targets = targetsFor({ type: "Revision", header: newest });
        event.preventDefault();
        lineMenu.set({ x: event.clientX, y: event.clientY, heading: null, commands: [
            ...revisionIdCommands([newest]),
            ...targetCommands(() => targets, "Annotate change…"),
        ] });
    }
</script>

<div class="revision-metadata">
    <MetadataList>
        {#if statuses.length}<MetadataRow label="Status"><div class="values">{#each statuses as { header, status }}<span class:warning={header.has_conflict || header.id.change.is_divergent}>{#if !singleton}<IdSpan id={header.id.change} /> {/if}{status}</span>{/each}</div></MetadataRow>{/if}
        <MetadataRow label={authors.length === 1 ? "Author" : "Authors"}><div class="values authors">{#each authors as author}<AuthorSpan {author} />{/each}</div></MetadataRow>
        <MetadataRow label="Authored"><TimestampSpan timestamp={newest.author.timestamp} /></MetadataRow>
        {#if singleton}
            <MetadataRow label="Change"><!-- svelte-ignore a11y_no_static_element_interactions (the same actions are in the timeline's menu) --><span class="revision-id" oncontextmenu={idMenu}><IdSpan selectable id={newest.id.change} /></span></MetadataRow>
            <MetadataRow label="Commit"><!-- svelte-ignore a11y_no_static_element_interactions (the same actions are in the timeline's menu) --><span class="commit-identity" oncontextmenu={idMenu}><IdSpan selectable id={newest.id.commit} /></span></MetadataRow>
        {/if}
        {#if bookmarks.length}<MetadataRow label="Bookmarks"><div class="references" aria-label="Revision bookmarks">{#each bookmarks as { header, ref }}{#if ref.type === "LocalBookmark" || ref.type === "RemoteBookmark"}<div class="reference"><BookmarkObject {header} {ref} /><span class="reference-status">{bookmarkStatus(ref)}</span></div>{/if}{/each}</div></MetadataRow>{/if}
        {#if tags.length}<MetadataRow label="Tags"><div class="references" aria-label="Revision tags">{#each tags as { header, ref }}{#if ref.type === "Tag"}<TagObject {header} {ref} />{/if}{/each}</div></MetadataRow>{/if}
        {#if revs.parents.length}<MetadataRow label={revs.parents.length === 1 ? "Parent" : "Parents"}><Zone operand={{ type: "Merge", header: oldest }} let:target><div class="parents" class:target>{#each revs.parents as parent}<RevisionObject header={parent} child={oldest} selected={false} noBookmarks expanded />{/each}</div></Zone></MetadataRow>{/if}
    </MetadataList>
</div>

<style>
    .revision-metadata { min-width: 0; }
    .values { display: flex; flex-wrap: wrap; gap: 4px 12px; min-width: 0; }
    .authors :global(.author) { white-space: normal; color: var(--text); }
    .revision-metadata :global(.timestamp) { color: var(--text); font: var(--font-body); white-space: normal; }
    .warning { color: var(--negative); }
    .references { display: flex; flex-wrap: wrap; align-items: start; gap: var(--gap-row) var(--gap-group); min-width: 0; }
    .reference { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; max-width: 100%; }
    /* a reference is as wide as its name, with its status beside it */
    .reference > :global(*) { flex: 0 1 auto; width: auto; max-width: 100%; }
    .references :global(.chip) { max-width: 100%; height: auto; min-height: 24px; white-space: normal; overflow-wrap: anywhere; }
    .references :global(.chip svg) { flex-shrink: 0; }
    .references :global(.chip span) { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
    .reference-status { color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    .parents { min-width: 0; margin: -4px -6px; }
    .parents :global(.layout) { min-height: 28px; padding: 4px 6px; }
    .parents.target { outline: var(--focus-width) solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-control); }
</style>
