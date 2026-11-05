<script lang="ts">
    import type { RepoConfig } from "../messages/RepoConfig";
    import Icon from "../controls/Icon.svelte";

    export let workspace: Extract<RepoConfig, { type: "Workspace" }>;
    export let currentQuery: string;
    export let collapsed = false;
    export let onSelect: (revset: string) => void;
    export let onWorkingCopy: () => void;
    $: views = [
        { label: "History", icon: "git-branch", revset: workspace.query_choices.default ?? "all()" },
        { label: "Bookmarks", icon: "bookmark", revset: "bookmarks()" },
        { label: "Conflicts", icon: "git-merge", revset: "conflicts()" },
    ];
    $: savedViews = Object.entries(workspace.query_choices).filter(([name]) => name !== "default");
</script>

<div class="repository-navigation" class:collapsed>
    <button class="working-copy" type="button" aria-label="Working copy" title="Working copy" on:click={onWorkingCopy}><Icon name="edit-3" />{#if !collapsed}<span>Working copy</span><kbd>@</kbd>{/if}</button>
    <nav aria-label="Repository views">
        {#if !collapsed}<h2>Views</h2>{/if}
        {#each views as view}
            <button class="selection-item" type="button" aria-label={view.label} title={view.label} aria-current={currentQuery === view.revset ? "page" : undefined} on:click={() => onSelect(view.revset)}><Icon name={view.icon} />{#if !collapsed}<span>{view.label}</span>{/if}</button>
        {/each}
    </nav>
    {#if savedViews.length}
        <nav aria-label="Saved revsets">
            {#if !collapsed}<h2>Saved revsets</h2>{/if}
            {#each savedViews as [name, revset]}
                <button class="selection-item" type="button" aria-label={name.replaceAll("-", " ")} title={`${name.replaceAll("-", " ")}: ${revset}`} aria-current={currentQuery === revset ? "page" : undefined} on:click={() => onSelect(revset)}><Icon name="filter" />{#if !collapsed}<span>{name.replaceAll("-", " ")}</span>{/if}</button>
            {/each}
        </nav>
    {/if}
    {#if !collapsed}<div class="remotes"><h2>Remotes</h2>{#each workspace.git_remotes as remote}<p><Icon name="cloud" /><span>{remote}</span></p>{:else}<p>No remotes configured</p>{/each}</div>{/if}
</div>

<style>
    .repository-navigation { min-width: 0; }
    nav { display: grid; gap: 2px; margin-block-start: 20px; }
    h2 { margin: 0 10px 6px; color: var(--faint); font-size: var(--type-caption); font-weight: 500; }
    button { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 7px 10px; border: 0; border-radius: var(--radius-control); color: var(--muted); background: transparent; font-size: var(--type-ui); text-align: start; cursor: pointer; }
    button > :global(svg) { color: var(--faint); }
    button span, .remotes p span { overflow-wrap: anywhere; min-width: 0; }
    .selection-item.selection-item[aria-current="page"] { font-weight: 500; color: var(--text-strong); background: var(--hover); }
    .selection-item[aria-current="page"] > :global(svg) { color: var(--accent); }
    .selection-item[aria-current="page"]::before { content: ""; position: absolute; inset-block: 9px; inset-inline-start: -8px; width: 2px; border-radius: 2px; background: var(--accent); }
    .working-copy { color: var(--text); background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
    .working-copy > :global(svg) { color: var(--positive); }
    kbd { margin-inline-start: auto; padding: 0 5px; border-radius: var(--radius-sm); background: var(--raised); color: var(--muted); font: 11px/18px var(--stack-code); box-shadow: inset 0 0 0 1px var(--border); }
    .remotes { margin-block-start: 20px; }
    .remotes p { display: flex; gap: 10px; align-items: center; padding: 6px 10px; margin: 0; color: var(--muted); font-size: var(--type-ui); }
    .remotes p > :global(svg) { color: var(--faint); }
    .collapsed button { justify-content: center; padding: 8px; }
    .collapsed .selection-item[aria-current="page"]::before { inset-inline-start: -6px; }
    .collapsed nav { margin-block-start: 16px; }
    @media (hover: hover) {
        .selection-item.selection-item:hover { color: var(--text); background: var(--hover); }
        .selection-item:hover > :global(svg) { color: var(--muted); }
        .selection-item[aria-current="page"]:hover > :global(svg) { color: var(--accent); }
        .working-copy:hover { background: var(--raised); color: var(--text-strong); box-shadow: inset 0 0 0 1px var(--control-hover); }
    }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
    @media (forced-colors: active) { .selection-item[aria-current="page"]::before { background: Highlight; } }
</style>
