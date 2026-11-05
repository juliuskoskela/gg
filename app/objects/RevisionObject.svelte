<script lang="ts">
    import { revisionAuthorHeight, revisionRowGap, revisionRowHeight } from "../graphLayout";
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
    import WorkspaceObject from "./WorkspaceObject.svelte";

    export let header: RevHeader;
    export let child: RevHeader | null = null;
    export let selected: boolean; // same as the imported event, but parent may want to force a value
    export let noBookmarks: boolean = false;
    export let expanded = false;
    export let tall = false;
    export let rowHeight = revisionRowHeight;
    export let onClick: ((header: RevHeader) => void) | undefined = undefined;
    export let onShiftClick: ((header: RevHeader) => void) | undefined = undefined;

    $: referenceNames = header.refs.map(ref => ref.type === "Tag" ? ref.tag_name : ref.type === "RemoteBookmark" ? `${ref.bookmark_name}@${ref.remote_name}` : ref.bookmark_name);
    $: accessibleLabel = [revisionLabel(header), ...referenceNames, ...(header.working_copy_of ? [`Workspace ${header.working_copy_of}`] : [])].join("; ");
    $: operand = (child ? { type: "Parent", header, child } : { type: "Revision", header }) as Operand;

    /*
     * Select this revision by default, or callback to a list that needs more complex behaviour.
     */
    function onSelect(event: CustomEvent<MouseEvent>) {
        if (event.detail.shiftKey) {
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
</script>

<Object
    {operand}
    suffix={header.id.commit.prefix}
    conflicted={header.has_conflict}
    {selected}
    label={accessibleLabel}
    on:click={onSelect}
    on:dblclick={onEdit}
    let:context
    let:hint={dragHint}>
    {#if child}
        <!-- Parents aren't a drop target -->
        <div class="layout compact" class:expanded>
            <IdSpan
                id={header.id.change}
                pronoun={context ||
                    ($currentTarget?.type == "Merge" &&
                        $currentTarget.header.parent_ids.findIndex((id) => id.hex == header.id.commit.hex) != -1)} />

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
        <Zone {operand} let:target let:hint={dropHint}>
            <div class="layout" class:target class:tall class:own-wc={header.is_working_copy && header.working_copy_of == null} class:conflicted={header.has_conflict} style:--history-row-height={`${rowHeight}px`} style:--history-author-height={`${revisionAuthorHeight}px`} style:--history-row-gap={`${revisionRowGap}px`}>
                <IdSpan id={header.id.change} pronoun={context || target || dropHint != null} />

                <span class="text desc truncate" class:indescribable={!context && header.description.lines[0] == ""}>
                    {#if header.has_conflict}<span class="status-icon" title="Unresolved conflict"><Icon name="alert-triangle" /></span>{/if}
                    {dragHint ??
                        dropHint ??
                        (header.description.lines[0] == "" ? "(no description set)" : header.description.lines[0])}
                </span>

                {#if tall}<span class="author truncate">{header.author.name || header.author.email || "Unknown author"}</span>{/if}
                <span class="refs" role="group" aria-label="Bookmarks and workspaces">
                    {#each header.refs as ref}
                        {#if ref.type != "Tag"}
                            {#if ref.type == "LocalBookmark" || !ref.is_synced || !ref.is_tracked}
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
        </Zone>
    {/if}
</Object>

<style>
    .layout {
        pointer-events: auto;
        /* layout summary components along a text line */
        width: 100%;
        height: var(--history-row-height, 32px);
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

    .layout.tall { grid-template-areas: "id desc refs" ". author ."; grid-template-rows: 22px var(--history-author-height); row-gap: var(--history-row-gap); }
    .author { grid-area: author; color: var(--muted); font-size: var(--type-caption); font-weight: 400; pointer-events: none; }
    .layout.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }

    .layout > :global(span) {
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
        gap: 3px;
        color: var(--text);
    }

    .refs > div { flex-shrink: 0; }

    /* multiple elements can have these */
    .truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .text {
        pointer-events: none;
    }

    .layout > :global(.id) { grid-area: id; font-size: var(--type-caption); color: var(--faint); }
    .layout > :global(.id .change), .layout > :global(.id .hidden) { color: var(--text); }
    /* prefix echoes its station; the mix toward strong text keeps 12px mono above 4.5:1 */
    .layout { --id-tint: color-mix(in oklab, var(--lane, var(--text)) var(--graph-node-chroma, 100%), var(--muted)); }
    .layout.own-wc { --id-tint: var(--positive); }
    .layout.conflicted { --id-tint: var(--negative); }
    .layout > :global(.id .prefix:is(.change, .hidden)) { color: color-mix(in oklab, var(--id-tint) 80%, var(--text-strong)); }
    .desc { font-size: var(--type-ui); font-weight: 400; color: var(--text); }
    :global(.selection-item[aria-selected="true"]) .desc:not(.indescribable) { color: var(--text-strong); font-weight: 500; }
    :global(.selection-item[aria-selected="true"]) .layout > :global(.id .change:not(.prefix)) { color: var(--text-strong); }
    @media (hover: hover) { :global(.selection-item:hover) .desc:not(.indescribable) { color: var(--text-strong); } }
    :global(.selection-item.conflict[role]) .desc.text { color: var(--negative); }
    .compact { height: auto; min-height: max(36px, 2.75em); grid-template-areas: "id desc refs"; grid-template-rows: 1fr; padding-right: 0; }
    .compact.expanded { height: auto; min-height: 52px; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id refs" "desc desc"; grid-template-rows: auto auto; gap: 4px 8px; padding: 8px; }
    .expanded .desc { white-space: normal; overflow-wrap: anywhere; line-height: 1.5; }
    @container timeline (max-width: 400px) {
        .layout:not(.compact) { grid-template-columns: max-content minmax(0, 1fr) fit-content(25%); }
        .layout:not(.compact) .refs { max-width: 64px; }
        .layout:not(.compact) .refs :global(.chip) { padding-inline: 4px; }
        .layout:not(.compact) .refs :global(.chip > span),
        .layout:not(.compact) .refs :global(.chip > svg:not(:first-child)) { display: none; }
    }
</style>
