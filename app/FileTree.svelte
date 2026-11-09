<script module lang="ts">
    let collapsedFolders = new Map<string, boolean>();
</script>

<script lang="ts">
    import FileTree from './FileTree.svelte';
    import type { RevChange } from "./messages/RevChange";
    import type { RevHeader } from "./messages/RevHeader";
    import ChangeObject from "./objects/ChangeObject.svelte";
    import Icon from "./controls/Icon.svelte";

    interface Props {
        changes: RevChange[];
        headers: RevHeader[];
        prefix?: string;
        selectedPath?: string | undefined;
        onSelect?: (change: RevChange) => void;
    }

    let {
        changes,
        headers,
        prefix = "",
        selectedPath = undefined,
        onSelect = () => {}
    }: Props = $props();
    let folders = $derived([...new Set(changes.map(change => change.path.repo_path.slice(prefix.length)).filter(path => path.includes("/")).map(path => path.split("/")[0]))].sort());
    let files = $derived(changes.filter(change => !change.path.repo_path.slice(prefix.length).includes("/")));
</script>

{#each folders as folder}
    <details open={!collapsedFolders.get(`${prefix}${folder}`)} ontoggle={event => collapsedFolders.set(`${prefix}${folder}`, !(event.currentTarget as HTMLDetailsElement).open)}>
        <summary title={`${prefix}${folder}`}><Icon name="chevron-right" /><span>{folder}</span></summary>
        <div class="children" role="group" aria-label={`${prefix}${folder}`}><FileTree changes={changes.filter(change => change.path.repo_path.startsWith(`${prefix}${folder}/`))} {headers} prefix={`${prefix}${folder}/`} {selectedPath} {onSelect} /></div>
    </details>
{/each}
{#each files as change}
    <ChangeObject tree {change} {headers} selected={selectedPath === change.path.repo_path} onSelected={() => onSelect(change)} />
{/each}

<style>
    details, summary { pointer-events: auto; }
    summary { display: flex; align-items: center; gap: 6px; min-height: var(--file-row-height); font-size: var(--type-ui); padding: 2px 3px; cursor: pointer; color: var(--text); border-radius: var(--radius-control); list-style: none; }
    summary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    summary::-webkit-details-marker { display: none; }
    details[open] > summary :global(svg) { transform: rotate(90deg); }
    :global([dir="rtl"]) summary :global(svg) { transform: rotate(180deg); }
    :global([dir="rtl"]) details[open] > summary :global(svg) { transform: rotate(90deg); }
    @media (hover: hover) { summary:hover { background: var(--hover); color: var(--text); } }
    summary:focus-visible { outline: var(--focus-width) solid var(--focus-ring); outline-offset: -2px; }
    .children { padding-inline-start: 12px; }
</style>
