<script lang="ts">
    import type { RevsResult } from "../messages/RevsResult";
    import { revisionMetadataVisible, ignoreToggled } from "../stores";
    import Icon from "../controls/Icon.svelte";
    import RevisionOverview from "./RevisionOverview.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    export let revs: Extract<RevsResult, { type: "Detail" }>;
    export let mode: "files" | "details" | null = null;
    export let onSection: (section: "files" | "details") => void = () => {};
    let editing = false;
    $: expanded = editing || (mode ? mode === "details" : $revisionMetadataVisible);
    function toggle() { if (mode) onSection(expanded ? "files" : "details"); else revisionMetadataVisible.update(value => !value); }
    let overview: InstanceType<typeof RevisionOverview>;
    function updateEditing(value: boolean) { editing = value; }
    $: undescribed = revs.headers.length === 1 && !revs.headers[0].description.lines[0];
    $: title = revs.headers.length === 1 ? revs.headers[0].description.lines[0] || "(no description set)" : `${revs.headers.length} revisions`;
    $: editable = revs.headers.length === 1 && (!revs.headers[0].is_immutable || $ignoreToggled);
</script>

<aside class="overview" aria-label="Revision overview">
    <div class="overview-heading">
        <button class="disclosure" class:undescribed type="button" title={title} aria-expanded={expanded} aria-controls="revision-overview-content" on:click={toggle}><Icon name={expanded ? "chevron-down" : "chevron-right"} /><span>{title}</span></button>
        <div class="overview-tools">
            {#if editable && !editing}<ActionWidget secondary tip="Edit revision description" onClick={() => { revisionMetadataVisible.set(true); overview.beginEditing(); }}><Icon name="edit-2" /><span class="edit-label">Edit description</span></ActionWidget>{/if}
        </div>
    </div>
    <div id="revision-overview-content" class="overview-scroll" hidden={!expanded}><RevisionOverview {revs} bind:this={overview} onEditingChange={updateEditing} /></div>
</aside>

<style>
    .overview { container: overview / inline-size; display: flex; flex-direction: column; min-width: 0; min-height: 0; flex-shrink: 0; border-block-end: 1px solid var(--rule); }
    .overview-tools { display: flex; align-items: center; gap: 4px; }
    .overview-tools :global(button) { font-size: var(--type-ui); }
    .overview-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 8px; }
    .disclosure { flex: 1; min-width: 0; text-align: start; display: inline-flex; align-items: center; gap: var(--control-gap); min-height: var(--control-height); padding: 5px var(--control-padding-inline); border: 0; border-radius: var(--radius-control); color: var(--text); background: transparent; font-size: var(--type-ui); cursor: pointer; }
    .disclosure.undescribed { color: var(--muted); font-weight: 400; }
    .disclosure span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .overview-scroll { max-height: min(240px, 35dvh); overflow: auto; overscroll-behavior: contain; min-height: 0; pointer-events: auto; }
    .overview-scroll[hidden] { display: none; }
    @container overview (max-width: 420px) { .edit-label { display: none; } }
    @media (hover: hover) { .disclosure:hover { background: var(--hover); } }
    .disclosure:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { .disclosure { min-height: 44px; } }
</style>
