<!--
@component
The look of one row in a file tree: indent, folder chevron, file icon, name, change marker and line counts. Hosts supply the element that is clickable.
-->

<script lang="ts">
    import type { Snippet } from "svelte";
    import FileIcon from "../controls/FileIcon.svelte";
    import Icon from "../controls/Icon.svelte";
    import type { RevChange } from "../messages/RevChange";
    import type { TreeRow } from "./fileTree";

    interface Props {
        row: Pick<TreeRow, "kind" | "name" | "path" | "depth" | "expanded" | "changed" | "count" | "change">;
        /** shown instead of the name, such as a hint while dragging */
        name?: string;
        /** the row is being dragged, so its markers lose their colour against the highlight */
        plain?: boolean;
        /** a file with unsaved edits */
        dirty?: boolean;
        /** after the line counts, at the row's trailing edge */
        trailing?: Snippet;
    }

    let { row, name = undefined, plain = false, dirty = false, trailing }: Props = $props();
    let formatter = new Intl.NumberFormat();
    let change = $derived(row.change);
    let added = $derived(change ? change.stat?.added ?? lines(change, "+") : 0);
    let removed = $derived(change ? change.stat?.removed ?? lines(change, "-") : 0);

    function lines(target: RevChange, sign: string) {
        return target.hunks.reduce((total, hunk) => total + hunk.lines.lines.filter(line => line.startsWith(sign)).length, 0);
    }
</script>

<div class="file-row" class:folder={row.kind !== "file"} class:group={row.kind === "group"} class:deleted={change?.kind === "Deleted"} style:--depth={row.depth}>
    {#if row.kind !== "file"}
        <span class="chevron" class:open={row.expanded}><Icon name="chevron-right" /></span>
        <span class="name" dir="auto">{row.name}</span>
        {#if row.kind === "group"}<span class="count" aria-label="{row.count} files">{formatter.format(row.count ?? 0)}</span>
        {:else if row.changed}<span class="count" aria-label="{row.changed} changed">{formatter.format(row.changed)}</span>{/if}
    {:else}
        <FileIcon path={row.path} />
        <span class="name" dir="auto">{name ?? row.name}</span>
        {#if dirty}<span class="unsaved" role="img" aria-label="Unsaved changes" title="Unsaved changes"></span>{/if}
        {#if change}
            {#if change.has_conflict}
                <span class="kind" role="img" aria-label="Unresolved conflict" title="Unresolved conflict"><Icon name="alert-triangle" state={plain ? null : "remove"} /></span>
            {:else if change.kind === "Added" || change.kind === "Deleted"}
                <span class="kind" role="img" aria-label={change.kind} title={change.kind}><Icon name={change.kind === "Added" ? "file-plus" : "file-minus"} state={plain ? null : change.kind === "Added" ? "add" : "remove"} /></span>
            {/if}
            {#if added || removed}
                <span class="stat" class:plain aria-label="{added} added, {removed} removed lines">{#if added}<span class="ins">+{added}</span>{/if}{#if removed}<span class="del">−{removed}</span>{/if}</span>
            {:else if change.kind === "Modified" && !change.has_conflict}
                <span class="kind modified" role="img" aria-label="Modified" title="Modified"></span>
            {/if}
        {/if}
        {@render trailing?.()}
    {/if}
</div>

<style>
    .file-row { box-sizing: border-box; display: flex; align-items: center; gap: var(--space-2); inline-size: 100%; block-size: var(--file-row-height); min-width: 0; padding-inline-end: var(--space-1); padding-inline-start: calc(var(--space-3) * var(--depth)); color: inherit; font: var(--font-body); text-align: start; }
    .name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .deleted .name { color: var(--muted); text-decoration: line-through; }
    .chevron { display: flex; flex: 0 0 auto; }
    .chevron.open :global(svg) { transform: rotate(90deg); }
    :global([dir="rtl"]) .chevron :global(svg) { transform: rotate(180deg); }
    :global([dir="rtl"]) .chevron.open :global(svg) { transform: rotate(90deg); }
    .group .name { color: var(--muted); font: var(--font-label); }
    .count { flex: 0 0 auto; color: var(--muted); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .kind { display: flex; flex: 0 0 auto; --icon-size: var(--space-3); }
    .unsaved { flex: 0 0 auto; inline-size: var(--space-2); block-size: var(--space-2); border-radius: 50%; background: var(--warning); }
    .kind.modified { inline-size: var(--space-1); block-size: var(--space-1); border-radius: 50%; background: var(--faint); }
    .stat { display: flex; flex: 0 0 auto; gap: var(--space-1); font: var(--font-label); font-variant-numeric: tabular-nums; }
    .ins { color: var(--positive); }
    .del { color: var(--negative); }
    .stat.plain span { color: inherit; }
</style>
