<script lang="ts">
    import { owningHeaders as fileOwners } from "../revision/origins";
    import { categoryLabel, categoryOf } from "../revision/fileCategories";
    import FileReviewBadge from "../review/FileReviewBadge.svelte";
    import { shortFilename } from "../paths";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import type { Operand } from "../messages/Operand";
    import type { ExternalDiff } from "../messages/ExternalDiff";
    import type { ExternalResolve } from "../messages/ExternalResolve";
    import FileIcon from "../controls/FileIcon.svelte";
    import FileRow from "../tree/FileRow.svelte";
    import type { TreeRow } from "../tree/fileTree";
    import Icon from "../controls/Icon.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import { changeSelectEvent, repoConfigEvent } from "../stores";
    import { mutate } from "../ipc";
    import ActionLink from "../controls/ActionLink.svelte";
    import NoteMarker from "../annotations/NoteMarker.svelte";
    import { effectiveAnchor } from "../annotations/anchors";
    import { openNotesByChange } from "../annotations/store";

    interface Props {
        headers: RevHeader[] | null;
        change: RevChange;
        selected: boolean;
        /** the row of a file tree, drawn by the tree's own row so it looks like every other tree row */
        tree?: boolean;
        /** where the row sits in the tree; without it the file stands alone at the top */
        row?: TreeRow | undefined;
        tabIndex?: number | undefined;
        wrap?: boolean;
        compactPath?: boolean;
        setSize?: number | undefined;
        position?: number | undefined;
        onSelected?: () => void;
    }

    let {
        headers,
        change,
        selected,
        tree = false,
        row = undefined,
        tabIndex = undefined,
        wrap = false,
        compactPath = false,
        setSize = undefined,
        position = undefined,
        onSelected = () => {}
    }: Props = $props();

    function countLines(target: RevChange, sign: string) {
        return target.hunks.reduce((total, hunk) => total + hunk.lines.lines.filter(line => line.startsWith(sign)).length, 0);
    }
    function onSelect() {
        changeSelectEvent.set(change);
        onSelected();
    }

    function onExternalDiff() {
        if (!owners.length) return;
        mutate<ExternalDiff>("external_diff", {
            id: owners[0].id,
            path: change.path,
        });
    }

    function onExternalResolve() {
        if (!owners.length) return;
        mutate<ExternalResolve>("external_resolve", {
            id: owners[0].id,
            path: change.path,
        });
    }
    let owners = $derived(headers ? fileOwners(change, headers) : []);
    let operand = $derived(owners.length ? { type: "Change", headers: owners, path: change.path, hunk: null } as Operand : null);
    // notes on the file or its lines, in the one revision shown
    let notes = $derived(owners.length === 1 ? ($openNotesByChange.get(owners[0].id.change.hex) ?? []).filter(note => note.targets.some(target => {
        let anchor = effectiveAnchor(target);
        return anchor.change_id === owners[0].id.change.hex && "path" in anchor && anchor.path === change.path.repo_path;
    })) : []);
    let hasDiffTool = $derived($repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_diff_tool);
    let hasMergeTool = $derived($repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_merge_tool);
    let treeRow = $derived<TreeRow>(row ?? { kind: "file", name: change.path.repo_path.split("/").pop() ?? "", path: change.path.repo_path, depth: 0, changed: 1, change });
    let insertions = $derived(change.stat?.added ?? countLines(change, "+"));
    let deletions = $derived(change.stat?.removed ?? countLines(change, "-"));
</script>

<Object
    {operand}
    {setSize}
    {position}
    {selected}
    role={tree ? "treeitem" : "option"}
    level={tree ? treeRow.depth + 1 : undefined}
    tabIndex={tabIndex ?? (tree ? 0 : -1)}
    suffix={change.path.repo_path}
    conflicted={change.has_conflict}
    label={change.path.relative_path}
    onClick={onSelect}

>
    {#snippet children({ context, hint })}
    <Zone {operand}>
    {#snippet children({ target })}
        {#if tree}
            {#snippet extras()}
                {#if headers && headers.length > 1 && change.origin}<span class="category" title={`Originating change ${change.origin.change.hex}`}>{change.origin.change.hex.slice(0, 8)}</span>{/if}
                {#if categoryOf(change) !== "Implementation"}<span class="category">{categoryLabel(change)}</span>{/if}
                {#if notes.length}<NoteMarker {notes} />{/if}
                {#if owners[0]}<FileReviewBadge header={owners[0]} path={change.path.repo_path} />{/if}
                {#if hasMergeTool && change.has_conflict && operand}
                    <span class="tool"><ActionWidget tip="resolve in merge tool" onClick={onExternalResolve}>
                        <Icon name="external-link" /> Resolve
                    </ActionWidget></span>
                {:else if hasDiffTool && operand}
                    <span class="tool"><ActionLink tip="open in diff tool" onClick={onExternalDiff}>
                        <Icon name="external-link" />
                    </ActionLink></span>
                {/if}
            {/snippet}
            <div class="tree-drop" class:target><FileRow row={treeRow} name={hint ?? undefined} plain={context} trailing={extras} /></div>
        {:else}
        <div class="layout" class:target class:wrap class:deleted={change.kind === "Deleted"}>
            <FileIcon path={change.path.repo_path} />
            <span class="name" dir="auto" title={change.path.relative_path}>{hint ?? (compactPath ? shortFilename(change.path.relative_path) : change.path.relative_path)}</span>
            {#if categoryOf(change) !== "Implementation"}<span class="category">{categoryLabel(change)}</span>{/if}
            {#if notes.length}<NoteMarker {notes} />{/if}
            {#if owners[0]}<FileReviewBadge header={owners[0]} path={change.path.repo_path} />{/if}
            {#if change.has_conflict}
                <span class="kind" role="img" aria-label="Unresolved conflict" title="Unresolved conflict"><Icon name="alert-triangle" state={context ? null : "remove"} /></span>
            {:else if change.kind === "Added" || change.kind === "Deleted"}
                <span class="kind" role="img" aria-label={change.kind} title={change.kind}><Icon name={change.kind === "Added" ? "file-plus" : "file-minus"} state={context ? null : change.kind === "Added" ? "add" : "remove"} /></span>
            {/if}
            {#if insertions || deletions}
                <span class="stat" class:plain={context} aria-label="{insertions} added, {deletions} removed lines">{#if insertions}<span class="ins">+{insertions}</span>{/if}{#if deletions}<span class="del">−{deletions}</span>{/if}</span>
            {:else if change.kind === "Modified" && !change.has_conflict}
                <span class="kind modified" role="img" aria-label="Modified" title="Modified"></span>
            {/if}
            {#if hasMergeTool && change.has_conflict && operand}
                <span class="tool"><ActionWidget tip="resolve in merge tool" onClick={onExternalResolve}>
                    <Icon name="external-link" /> Resolve
                </ActionWidget></span>
            {:else if hasDiffTool && operand}
                <span class="tool"><ActionLink tip="open in diff tool" onClick={onExternalDiff}>
                    <Icon name="external-link" />
                </ActionLink></span>
            {/if}
        </div>
        {/if}

    {/snippet}
</Zone>

    {/snippet}
</Object>

<style>
    .layout {
        min-height: 36px;
        padding: 6px 8px;
        font-size: var(--type-ui);
        line-height: 1.4;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding-inline-start: 3px;
    }

    .tree-drop { inline-size: 100%; }
    .tree-drop.target { outline: 2px solid var(--text); outline-offset: -2px; border-radius: var(--radius-control); color: var(--text); }
    .tree-drop .tool :global(button) { min-height: var(--file-row-height); min-width: var(--file-row-height); padding-block: 0; }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 auto;
        min-width: 0;
    }
    .category { color: var(--muted); font: var(--font-label); white-space: nowrap; }
    .deleted .name { color: var(--muted); }

    .kind { display: flex; flex: 0 0 auto; --icon-size: 13px; }
    .kind.modified { width: 5px; height: 5px; border-radius: 50%; background: var(--faint); }
    .stat { display: flex; flex: 0 0 auto; gap: 5px; font-size: var(--type-caption); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
    .ins { color: var(--positive); }
    .del { color: var(--negative); }
    .stat.plain span { color: inherit; }
    .tool { display: flex; flex: 0 0 auto; margin-inline-start: auto; }

    @media (pointer: coarse), (max-width: 600px) { .layout { min-height: 44px; } }
    .layout.wrap .name { white-space: normal; overflow-wrap: anywhere; }

    .layout.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }
</style>
