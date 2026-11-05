<script lang="ts">
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
    export let onClick: ((header: RevHeader) => void) | undefined = undefined;
    export let onShiftClick: ((header: RevHeader) => void) | undefined = undefined;

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
    label={revisionLabel(header)}
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
            <div class="layout" class:target>
                <IdSpan id={header.id.change} pronoun={context || target || dropHint != null} />

                <span class="text desc truncate" class:indescribable={!context && header.description.lines[0] == ""}>
                    {#if header.has_conflict}<span class="status-icon" title="Unresolved conflict"><Icon name="alert-triangle" /></span>{/if}
                    {dragHint ??
                        dropHint ??
                        (header.description.lines[0] == "" ? "(no description set)" : header.description.lines[0])}
                </span>

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
        height: 44px;
        display: grid;
        grid-template-areas: "id desc refs";
        grid-template-columns: 4.75rem minmax(0, 1fr) fit-content(40%);
        grid-template-rows: 1fr;
        align-content: center;
        padding-right: 12px;
        align-items: center;
        column-gap: 10px;
        row-gap: 0;

        /* skip past svg lines when used in a graph */
        padding-left: var(--leftpad);
    }

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

    .layout > :global(.id) { grid-area: id; font-size: var(--type-caption); }
    .desc { font-size: var(--type-ui); font-weight: 400; }
    :global(.selection-item[aria-selected="true"]) .desc:not(.indescribable) { font-weight: 500; }
    .compact { height: auto; min-height: max(36px, 2.75em); grid-template-areas: "id desc refs"; grid-template-rows: 1fr; padding-right: 0; }
    .compact.expanded { height: auto; min-height: 52px; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id refs" "desc desc"; grid-template-rows: auto auto; gap: 4px 8px; padding: 8px; }
    .expanded .desc { white-space: normal; overflow-wrap: anywhere; line-height: 1.5; }
    @container timeline (max-width: 400px) { .layout:not(.compact) { grid-template-columns: 4rem minmax(0, 1fr) fit-content(40%); grid-template-areas: "id desc refs"; column-gap: 8px; } }
    @media (max-width: 900px) { .layout:not(.compact) { grid-template-columns: 4rem minmax(0, 1fr) fit-content(40%); grid-template-areas: "id desc refs"; column-gap: 8px; } }
</style>
