<script lang="ts">
    import type { RepoConfig } from "../messages/RepoConfig";
    import Icon from "../controls/Icon.svelte";

    export let workspace: Pick<Extract<RepoConfig, { type: "Workspace" }>, "query_choices">;
    export let currentQuery: string;
    export let collapsed = false;
    export let onSelect: (revset: string) => void;
    export let onWorkingCopy: () => void;
    export let onHistory: () => void = () => {};
    $: views = [
        { label: "All revisions", icon: "git-branch", revset: workspace.query_choices.default ?? "all()" },
        { label: "Bookmarks", icon: "bookmark", revset: "bookmarks()" },
        { label: "Conflicts", icon: "git-merge", revset: "conflicts()" },
    ];
    $: savedViews = Object.entries(workspace.query_choices).filter(([name]) => name !== "default");
</script>

<div class="repository-navigation" class:collapsed>
    <button class="working-copy" type="button" aria-label="Working copy" title="Working copy" on:click={onWorkingCopy}><Icon name="edit-3" />{#if !collapsed}<span>Working copy</span><kbd>@</kbd>{/if}</button>
    <button class="selection-item history-entry" type="button" aria-label="Repository history" title="Repository history" on:click={onHistory}><Icon name="clock" />{#if !collapsed}<span>History</span>{/if}</button>
    <nav aria-label="Repository views">
        {#if !collapsed}<h2>Revisions</h2>{/if}
        {#each views as view}
            <button class="selection-item" type="button" aria-label={view.label} title={view.label} aria-current={currentQuery === view.revset ? "page" : undefined} on:click={() => onSelect(view.revset)}><Icon name={view.icon} />{#if !collapsed}<span>{view.label}</span>{/if}</button>
        {/each}
    </nav>
    {#if savedViews.length}
        <nav aria-label="Saved revsets">
            {#if !collapsed}<h2>Saved revsets</h2>{/if}
            {#each savedViews as [name, revset]}
                <button class="selection-item" type="button" aria-label={`Saved revset: ${name.replaceAll("-", " ")}`} title={`Saved revset: ${name.replaceAll("-", " ")}: ${revset}`} aria-current={currentQuery === revset ? "page" : undefined} on:click={() => onSelect(revset)}><Icon name="filter" />{#if !collapsed}<span>{name.replaceAll("-", " ")}</span>{/if}</button>
            {/each}
        </nav>
    {/if}
</div>

<style>
    .repository-navigation { min-width: 0; }
    .history-entry { margin-block-start: 6px; }
    nav { display: grid; gap: 2px; margin-block-start: 20px; }
    h2 { margin: 0 10px 6px; color: var(--faint); font-size: var(--type-caption); font-weight: 500; }
    button { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 7px 10px; border: 0; border-radius: var(--radius-control); color: var(--muted); background: transparent; font-size: var(--type-ui); text-align: start; cursor: pointer; }
    button > :global(svg) { color: var(--faint); }
    button span { overflow-wrap: anywhere; min-width: 0; }
    .selection-item.selection-item[aria-current="page"] { font-weight: 500; color: var(--selection-text); background: var(--selection-bg); }
    .selection-item[aria-current="page"] > :global(svg) { color: var(--text); }
    .working-copy { color: var(--text); background: var(--surface); border: 1px solid var(--border); }
    .working-copy > :global(svg) { color: var(--positive); }
    kbd { margin-inline-start: auto; padding: 0 5px; border-radius: var(--radius-sm); background: var(--raised); color: var(--muted); font: 11px/18px var(--stack-code); box-shadow: inset 0 0 0 1px var(--border); }
    .collapsed button { justify-content: center; padding: 8px; }
    .collapsed nav { margin-block-start: 16px; }
    @media (hover: hover) {
        .selection-item.selection-item:hover { color: var(--text); background: var(--hover); }
        .selection-item:hover > :global(svg) { color: var(--muted); }
        .selection-item[aria-current="page"]:hover > :global(svg) { color: var(--text); }
        .working-copy:hover { background: var(--raised); color: var(--text-strong); border-color: var(--control-hover); }
    }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
</style>
