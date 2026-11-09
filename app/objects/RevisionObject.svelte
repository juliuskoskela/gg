<script lang="ts">
    import TimelineStat from "../revision/TimelineStat.svelte";
    import { revisionAuthorHeight, revisionTitleHeight, revisionRowGap, revisionRowHeight } from "../graphLayout";
    import type { RevHeader } from "../messages/RevHeader";
    import type { Operand } from "../messages/Operand";
    import { ignoreToggled, currentTarget, revisionSelectEvent } from "../stores.js";
    import { revisionLabel } from "../revisionStatus";
    import Icon from "../controls/Icon.svelte";
    import IdSpan from "../controls/IdSpan.svelte";
    import BookmarkObject from "./BookmarkObject.svelte";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import RevisionMutator from "../mutators/RevisionMutator";
    import TagObject from "./TagObject.svelte";
    import NoteMarker from "../annotations/NoteMarker.svelte";
    import { openNotesByChange } from "../annotations/store";
    import WorkspaceObject from "./WorkspaceObject.svelte";

    interface Props {
        header: RevHeader;
        showStats?: boolean;
        child?: RevHeader | null;
        selected: boolean; // same as the imported event, but parent may want to force a value
        noBookmarks?: boolean;
        expanded?: boolean;
        tall?: boolean;
        rowHeight?: number;
        textScale?: number;
        onClick?: ((header: RevHeader) => void) | undefined;
        onShiftClick?: ((header: RevHeader) => void) | undefined;
        /** Ctrl/⌘+click: add or remove this revision from a scattered selection */
        onToggle?: ((header: RevHeader) => void) | null;
        /** which identifiers to show; the timeline lets people choose, other lists keep the change id */
        showChange?: boolean;
        showCommit?: boolean;
        showBookmarks?: boolean;
        showTags?: boolean;
    }

    let {
        header,
        showStats = false,
        child = null,
        selected,
        noBookmarks = false,
        expanded = false,
        tall = false,
        rowHeight = revisionRowHeight,
        textScale = 1,
        onClick = undefined,
        onShiftClick = undefined,
        onToggle = null,
        showChange = true,
        showCommit = false,
        showBookmarks = true,
        showTags = true
    }: Props = $props();

    /*
     * Select this revision by default, or callback to a list that needs more complex behaviour.
     */
    function onSelect(event: MouseEvent) {
        if ((event.ctrlKey || event.metaKey) && onToggle) {
            onToggle(header);
        } else if (event.shiftKey) {
            if (onShiftClick) {
                onShiftClick(header);
            } else {
                revisionSelectEvent.set({ from: header.id, to: header.id });
            }
        } else {
            if (onClick) {
                onClick(header);
            } else {
                revisionSelectEvent.set({ from: header.id, to: header.id });
            }
        }
    }

    function onEdit() {
        new RevisionMutator([header], $ignoreToggled).onEdit();
    }
    let notes = $derived($openNotesByChange.get(header.id.change.hex) ?? []);
    let referenceNames = $derived(header.refs.map(ref => ref.type === "Tag" ? ref.tag_name : ref.type === "RemoteBookmark" ? `${ref.bookmark_name}@${ref.remote_name}` : ref.bookmark_name));
    let accessibleLabel = $derived([revisionLabel(header), ...referenceNames, ...(header.working_copy_of ? [`Workspace ${header.working_copy_of}`] : [])].join("; "));
    let operand = $derived((child ? { type: "Parent", header, child } : { type: "Revision", header }) as Operand);
</script>

<Object
    {operand}
    suffix={header.id.commit.prefix}
    conflicted={header.has_conflict}
    {selected}
    label={accessibleLabel}
    onClick={onSelect}
    onDoubleClick={onEdit}

>
    {#snippet children({ context, hint: dragHint })}
    {#if child}
        <!-- Parents aren't a drop target -->
        <div class="layout compact" class:expanded>
            <span class="ids"><IdSpan
                id={header.id.change}
                pronoun={context ||
                    ($currentTarget?.type == "Merge" &&
                        $currentTarget.header.parent_ids.findIndex((id) => id.hex == header.id.commit.hex) != -1)} /></span>

            <span class="text desc truncate" class:indescribable={!context && header.description.lines[0] == ""}>
                {#if header.has_conflict}<span class="status-icon" title="Unresolved conflict"><Icon name="alert-triangle" /></span>{/if}
                {dragHint ?? (header.description.lines[0] == "" ? "(no description set)" : header.description.lines[0])}
            </span>

            <span class="refs" role="group" aria-label="Bookmarks and workspaces">
                {#each header.refs as ref}
                    {#if ref.type != "Tag"}
                        {#if !noBookmarks && (ref.type == "LocalBookmark" || !ref.is_synced || !ref.is_tracked)}
                            <div>
                                <BookmarkObject {header} {ref} />
                            </div>
                        {/if}
                    {:else}
                        <div>
                            <TagObject {header} {ref} />
                        </div>
                    {/if}
                {/each}
                {#if header.working_copy_of}
                    <div>
                        <WorkspaceObject name={header.working_copy_of} />
                    </div>
                {/if}
            </span>
        </div>
    {:else}
        <Zone {operand}>
    {#snippet children({ target, hint: dropHint })}
            <div class="layout" class:target class:tall class:no-ids={!showChange && !showCommit} class:workspace={header.is_working_copy} class:conflicted={header.has_conflict} style:--history-row-height={`${rowHeight}px`} style:--history-title-height={`${revisionTitleHeight * textScale}px`} style:--history-author-height={`${revisionAuthorHeight * textScale}px`} style:--history-row-gap={`${revisionRowGap * textScale}px`}>
                {#if showChange || showCommit}<span class="ids">{#if showChange}<IdSpan id={header.id.change} pronoun={context || target || dropHint != null} />{/if}{#if showCommit}<span class="commit-id"><IdSpan id={header.id.commit} /></span>{/if}</span>{/if}

                <span class="text desc truncate" class:indescribable={!context && header.description.lines[0] == ""}>
                    {#if header.has_conflict}<span class="status-icon" title="Unresolved conflict"><Icon name="alert-triangle" /></span>{/if}
                    {#if notes.length}<NoteMarker {notes} />{/if}
                    {dragHint ??
                        dropHint ??
                        (header.description.lines[0] == "" ? "(no description set)" : header.description.lines[0])}
                </span>

                {#if tall}<span class="author truncate">{header.author.name || header.author.email || "Unknown author"}</span>{/if}
                <span class="refs" role="group" aria-label="Bookmarks and workspaces">
                    {#if showStats}<TimelineStat id={header.id} />{/if}
                    {#each header.refs as ref}
                        {#if ref.type != "Tag"}
                            {#if showBookmarks && (ref.type == "LocalBookmark" || !ref.is_synced || !ref.is_tracked)}
                                <div>
                                    <BookmarkObject {header} {ref} />
                                </div>
                            {/if}
                        {:else if showTags}
                            <div>
                                <TagObject {header} {ref} />
                            </div>
                        {/if}
                    {/each}
                    {#if header.working_copy_of}
                        <div>
                            <WorkspaceObject name={header.working_copy_of} />
                        </div>
                    {/if}
                </span>
            </div>

    {/snippet}
</Zone>
    {/if}

    {/snippet}
</Object>

<style>
    .layout {
        pointer-events: auto;
        /* layout summary components along a text line */
        width: 100%;
        height: var(--history-row-height, 28px);
        display: grid;
        grid-template-areas: "id desc refs";
        grid-template-columns: max-content minmax(0, 1fr) fit-content(40%);
        grid-template-rows: 1fr;
        align-content: center;
        padding-right: 12px;
        align-items: center;
        column-gap: 8px;
        row-gap: 0;

        /* skip past svg lines when used in a graph */
        padding-left: var(--leftpad);
    }

    /* the sparse view: a 20px title line and an 18px author line, on the type system's body and label roles */
    .layout.tall { grid-template-areas: "id desc refs" ". author ."; grid-template-rows: var(--history-title-height, 20px) var(--history-author-height); row-gap: var(--history-row-gap); }
    .author { grid-area: author; color: var(--muted); font: var(--font-label); pointer-events: none; }
    /* with no ids the description starts where the ids would */
    .layout.no-ids { grid-template-areas: "desc refs"; grid-template-columns: minmax(0, 1fr) fit-content(40%); }
    .layout.tall.no-ids { grid-template-areas: "desc refs" "author ."; }
    .ids { grid-area: id; display: inline-flex; align-items: baseline; gap: 8px; }
    .commit-id :global(.id) { color: var(--muted); }
    .layout.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }

    .layout> :global(span) {
        line-height: 1.54;
    }

    .status-icon { display: inline-flex; vertical-align: -3px; margin-inline-end: 4px; color: var(--negative); }

    .desc {
        grid-area: desc;
    }

    .desc.indescribable {
        font-weight: 400;
        color: var(--muted);
    }

    .refs {
        grid-area: refs;
        align-self: center;
        display: flex;
        justify-content: start;
        min-width: 0;
        max-width: 100%;
        /* webkit misplaces scrolling layers inside transformed svg foreign objects. */
        overflow-x: clip;
        scrollbar-width: none;
        gap: 6px;
        color: var(--text);
    }

    .refs> div { flex-shrink: 0; }

    /* multiple elements can have these */
    .truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .text {
        pointer-events: none;
    }

    .ids> :global(.id) { font-size: var(--type-caption); color: var(--muted); }
    .ids> :global(.id .change), .ids> :global(.id .hidden) { color: var(--text); }
    /* lane colors are graded for text, including hovered selections. */
    .layout { --id-tint: var(--lane, var(--text)); }
    .layout.workspace { --id-tint: var(--brand); }
    .layout.conflicted { --id-tint: var(--negative); }
    .ids> :global(.id .prefix:is(.change, .hidden)) { color: var(--id-tint); }
    .desc { font-size: var(--type-ui); font-weight: 400; color: var(--text); }
    :global(.selection-item[aria-selected="true"]) .desc:not(.indescribable) { color: var(--text-strong); font-weight: 500; }
    :global(.selection-item[aria-selected="true"]) .ids> :global(.id .change:not(.prefix)) { color: var(--text-strong); }
    @media (hover: hover) { :global(.selection-item:hover) .desc:not(.indescribable) { color: var(--text-strong); } }
    :global(.selection-item.conflict[role]) .desc.text { color: var(--negative); }
    .compact { height: auto; min-height: max(36px, 2.75em); grid-template-areas: "id desc refs"; grid-template-rows: 1fr; padding-right: 0; }
    .compact.expanded { height: auto; min-height: 52px; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id refs" "desc desc"; grid-template-rows: auto auto; gap: 4px 8px; padding: 8px; }
    .expanded .desc { white-space: normal; overflow-wrap: anywhere; line-height: 1.5; }
    @container timeline (max-width: 400px) {
        .layout:not(.compact) { grid-template-columns: max-content minmax(0, 1fr) fit-content(25%); }
        .layout.no-ids:not(.compact) { grid-template-columns: minmax(0, 1fr) fit-content(25%); }
        .layout:not(.compact) .refs { max-width: 64px; }
        .layout:not(.compact) .refs :global(.chip) { padding-inline: 4px; }
        .layout:not(.compact) .refs :global(.chip> span),
        .layout:not(.compact) .refs :global(.chip> svg:not(:first-child)) { display: none; }
    }
</style>
