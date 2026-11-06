<script lang="ts">
    import { shortFilename } from "../paths";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import type { Operand } from "../messages/Operand";
    import type { ExternalDiff } from "../messages/ExternalDiff";
    import type { ExternalResolve } from "../messages/ExternalResolve";
    import FileIcon from "../controls/FileIcon.svelte";
    import Icon from "../controls/Icon.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import { changeSelectEvent, repoConfigEvent } from "../stores";
    import { mutate } from "../ipc";
    import ActionLink from "../controls/ActionLink.svelte";
    import NoteMarker from "../annotations/NoteMarker.svelte";
    import { openNotesByChange } from "../annotations/store";

    export let headers: RevHeader[] | null;
    export let change: RevChange;
    export let selected: boolean;
    export let tree = false;
    export let wrap = false;
    export let compactPath = false;
    export let setSize: number | undefined = undefined;
    export let position: number | undefined = undefined;
    export let onSelected: () => void = () => {};

    $: operand = headers ? { type: "Change", headers, path: change.path, hunk: null } as Operand : null;
    // notes on the file or its lines, in the one revision shown
    $: notes = headers?.length === 1 ? ($openNotesByChange.get(headers[0].id.change.hex) ?? []).filter(note => "path" in note.anchor && note.anchor.path === change.path.repo_path) : [];

    $: hasDiffTool = $repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_diff_tool;
    $: hasMergeTool = $repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_merge_tool;

    $: insertions = change.stat?.added ?? countLines(change, "+");
    $: deletions = change.stat?.removed ?? countLines(change, "-");
    function countLines(target: RevChange, sign: string) {
        return target.hunks.reduce((total, hunk) => total + hunk.lines.lines.filter(line => line.startsWith(sign)).length, 0);
    }
    function onSelect() {
        changeSelectEvent.set(change);
        onSelected();
    }

    function onExternalDiff() {
        if (!headers) return;
        mutate<ExternalDiff>("external_diff", {
            id: headers[0].id,
            path: change.path,
        });
    }

    function onExternalResolve() {
        if (!headers) return;
        mutate<ExternalResolve>("external_resolve", {
            id: headers[0].id,
            path: change.path,
        });
    }
</script>

<Object
    {operand}
    {setSize}
    {position}
    {selected}
    tabIndex={tree ? 0 : -1}
    suffix={change.path.repo_path}
    conflicted={change.has_conflict}
    label={change.path.relative_path}
    on:click={onSelect}
    let:context
    let:hint>
    <Zone {operand} let:target>
        <div class="layout" class:tree class:target class:wrap class:deleted={change.kind === "Deleted"}>
            <FileIcon path={change.path.repo_path} />
            <span class="name" dir="auto" title={change.path.relative_path}>{hint ?? (compactPath ? shortFilename(change.path.relative_path) : tree ? change.path.repo_path.split("/").pop() : change.path.relative_path)}</span>
            {#if notes.length}<NoteMarker {notes} />{/if}
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
    </Zone>
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

    .layout.tree { min-height: var(--file-row-height); padding-block: 2px; }
    .layout.tree:has(.tool) { padding-block: 0; }
    .layout.tree .tool :global(button) { min-height: var(--file-row-height); min-width: var(--file-row-height); padding-block: 0; }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 auto;
        min-width: 0;
    }
    .deleted .name { color: var(--muted); }

    .kind { display: flex; flex: 0 0 auto; --icon-size: 13px; }
    .kind.modified { width: 5px; height: 5px; border-radius: 50%; background: var(--faint); }
    .stat { display: flex; flex: 0 0 auto; gap: 5px; font-size: var(--type-caption); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
    .ins { color: var(--positive); }
    .del { color: var(--negative); }
    .stat.plain span { color: inherit; }
    .tool { display: flex; flex: 0 0 auto; margin-inline-start: auto; }

    @media (pointer: coarse), (max-width: 600px) { .layout:not(.tree) { min-height: 44px; } }
    .layout.wrap .name { white-space: normal; overflow-wrap: anywhere; }

    .layout.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }
</style>
