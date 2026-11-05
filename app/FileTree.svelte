<script lang="ts">
    import type { RevChange } from "./messages/RevChange";
    import type { RevHeader } from "./messages/RevHeader";
    import ChangeObject from "./objects/ChangeObject.svelte";
    import Icon from "./controls/Icon.svelte";

    export let changes: RevChange[];
    export let headers: RevHeader[];
    export let prefix = "";
    export let selectedPath: string | undefined = undefined;
    export let onSelect: (change: RevChange) => void = () => {};
    $: folders = [...new Set(changes.map(change => change.path.repo_path.slice(prefix.length)).filter(path => path.includes("/")).map(path => path.split("/")[0]))].sort();
    $: files = changes.filter(change => !change.path.repo_path.slice(prefix.length).includes("/"));
</script>

{#each folders as folder}
    <details open>
        <summary><Icon name="chevron-right" /><span>{folder}</span></summary>
        <div class="children" role="group" aria-label={`${prefix}${folder}`}><svelte:self changes={changes.filter(change => change.path.repo_path.startsWith(`${prefix}${folder}/`))} {headers} prefix={`${prefix}${folder}/`} {selectedPath} {onSelect} /></div>
    </details>
{/each}
{#each files as change}
    <ChangeObject tree {change} {headers} selected={selectedPath === change.path.repo_path} onSelected={() => onSelect(change)} />
{/each}

<style>
    details, summary { pointer-events: auto; }
    summary { display: flex; align-items: center; gap: 4px; min-height: 32px; font-size: var(--type-ui); padding: 6px 2px; cursor: pointer; color: var(--text); border-radius: var(--radius-control); list-style: none; }
    summary::-webkit-details-marker { display: none; }
    details[open] > summary :global(svg) { transform: rotate(90deg); }
    :global([dir="rtl"]) summary :global(svg) { transform: rotate(180deg); }
    :global([dir="rtl"]) details[open] > summary :global(svg) { transform: rotate(90deg); }
    @media (hover: hover) { summary:hover { background: var(--hover); color: var(--text); } }
    summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    @media (pointer: coarse), (max-width: 600px) { summary { min-height: 44px; padding-block: 12px; } }
    .children { padding-inline-start: 12px; }
</style>
