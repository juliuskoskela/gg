<script lang="ts">
    import { shortFilename } from "../paths";
    import type { RevChange } from "../messages/RevChange";
    import type { RevHeader } from "../messages/RevHeader";
    import type { Operand } from "../messages/Operand";
    import type { ExternalDiff } from "../messages/ExternalDiff";
    import type { ExternalResolve } from "../messages/ExternalResolve";
    import Icon from "../controls/Icon.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import Object from "./Object.svelte";
    import Zone from "./Zone.svelte";
    import { changeSelectEvent, repoConfigEvent } from "../stores";
    import { mutate } from "../ipc";
    import ActionLink from "../controls/ActionLink.svelte";

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

    $: hasDiffTool = $repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_diff_tool;
    $: hasMergeTool = $repoConfigEvent.type === "Workspace" && $repoConfigEvent.has_external_merge_tool;

    $: icon = change.kind === "Added" ? "file-plus" : change.kind === "Deleted" ? "file-minus" : "file";
    $: state = (change.kind === "Added" ? "add" : change.kind === "Deleted" ? "remove" : null) as "add" | "change" | "remove" | null;
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
        <div class="layout" class:target class:wrap>
            <Icon name={icon} state={context ? null : state} />
            <span dir="auto" title={change.path.relative_path}>{hint ?? (compactPath ? shortFilename(change.path.relative_path) : tree ? change.path.repo_path.split("/").pop() : change.path.relative_path)}</span>
            {#if hasMergeTool && change.has_conflict && operand}
                <ActionWidget tip="resolve in merge tool" onClick={onExternalResolve}>
                    <Icon name="external-link" /> Resolve
                </ActionWidget>
            {:else if hasDiffTool && operand}
                <ActionLink tip="open in diff tool" onClick={onExternalDiff}>
                    <Icon name="external-link" />
                </ActionLink>
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

    .layout span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    @media (pointer: coarse), (max-width: 600px) { .layout { min-height: 44px; } }
    .layout.wrap span { white-space: normal; overflow-wrap: anywhere; }

    .layout.target {
        outline: 2px solid var(--text);
        outline-offset: -2px;
        border-radius: var(--radius-control);
        color: var(--text);
    }
</style>
