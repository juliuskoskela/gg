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
    nav { display: grid; gap: 4px; margin-block-start: 20px; }
    h2 { margin: 0 8px 6px; color: var(--muted); font-size: var(--type-caption); font-weight: 400; }
    button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 8px; border: 0; border-radius: var(--radius-control); color: var(--text); background: transparent; font-size: var(--type-ui); text-align: start; cursor: pointer; }
    button span, .remotes p span { overflow-wrap: anywhere; min-width: 0; }
    .selection-item[aria-current="page"] { font-weight: 500; }
    kbd { margin-inline-start: auto; font: 12px var(--stack-code); }
    .remotes { margin-block-start: 20px; }
    .remotes p { display: flex; gap: 10px; align-items: center; padding: 6px 8px; margin: 0; color: var(--muted); font-size: var(--type-ui); }
    .collapsed button { justify-content: center; padding: 8px; }
    .collapsed nav { margin-block-start: 16px; }
    @media (hover: hover) { .working-copy:hover { background: var(--hover); color: var(--text); } }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
</style>
