<script lang="ts">
    import { setContext } from "svelte";
    import RevisionOverview from "../revision/RevisionOverview.svelte";
    import { revisionFixture } from "./revisionFixture";
    import PanelTabs from "../controls/PanelTabs.svelte";
    import PanelHeader from "../controls/PanelHeader.svelte";
    import Icon from "../controls/Icon.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import DiffDisplayOptions from "../revision/DiffDisplayOptions.svelte";
    import RepositoryNavigation from "../shell/RepositoryNavigation.svelte";

    setContext("settings", { markUnpushedBookmarks: true });
    let theme = "dark";
    let active = "diff";
    let currentQuery = "all()";
    let wrap = true;
    let items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }, { id: "operation", label: "Operation" }];
    let workspace = { query_choices: { default: "all()", "My revisions": "mine()" } };
    let rows = [
        { kind: "context", number: 1, text: 'import PanelTabs from "./controls/PanelTabs.svelte";' },
        { kind: "context", number: 2, text: "" },
        { kind: "removed", number: 3, text: 'let selection = "underline";' },
        { kind: "added", number: 3, text: 'let selection = "surface";' },
        { kind: "context", number: 4, text: 'let panels = ["Timeline", "Diff", "Edit"];' },
    ];
</script>

<div id="shell" class={theme}>
    <main class="system-page">
        <header class="page-heading"><div><h1>GG+ design system</h1><p>Shared components for the revision workspace.</p></div><button type="button" on:click={() => theme = theme === "dark" ? "light" : "dark"}><Icon name={theme === "dark" ? "sun" : "moon"} />{theme === "dark" ? "Light" : "Dark"} theme</button></header>
        <section class="workspace-example" aria-label="Workspace components">
            <aside class="navigation-example"><PanelHeader><h2>Repository</h2></PanelHeader><div class="navigation-content"><RepositoryNavigation {workspace} {currentQuery} onSelect={value => currentQuery = value} onWorkingCopy={() => currentQuery = "@"} /></div></aside>
            <div class="reader-example">
                <PanelTabs {items} {active} prefix="example" onSelect={id => active = id} onClose={id => { items = items.filter(item => item.id !== id); if (active === id) active = items[0]?.id ?? ""; }} />
                {#each items as item}
                    <div id="example-{item.id}" role="tabpanel" aria-labelledby="example-tab-{item.id}" hidden={active !== item.id}>
                        {#if item.id === "diff"}
                            <PanelHeader label="Diff tools"><span>1 file</span><span class="added">+1</span><span class="removed">−1</span><DiffDisplayOptions /></PanelHeader>
                            <PanelHeader><Icon name="file-text" /><span>app/workspace.svelte</span></PanelHeader>
                            <div class="code-example">{#each rows as row}<div class="code-line {row.kind}"><span>{row.number}</span><span>{row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}</span><code>{row.text}</code></div>{/each}</div>
                        {:else if item.id === "edit"}<PanelHeader><Icon name="file-text" /><span>app/workspace.svelte</span></PanelHeader><textarea aria-label="Example editor" spellcheck="false">{rows.filter(row => row.kind !== "removed").map(row => row.text).join("\n")}</textarea>
                        {:else}<PanelHeader><h2>Current operation</h2></PanelHeader><p class="operation-example">No pending operation in this component preview.</p>{/if}
                    </div>
                {/each}
                {#if !items.length}<p class="operation-example">No views open. <button type="button" on:click={() => { items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }, { id: "operation", label: "Operation" }]; active = "diff"; }}>Restore views</button></p>{/if}
            </div>
        </section>
        <section id="description" class="description-specimen" aria-label="Description component preview">
            <h2>Description and metadata</h2><p>One document, aligned fields, and wrapping references. This specimen uses the production description components.</p>
            <div class="description-sample"><PanelTabs items={[{ id: "description", label: "Description" }]} active="description" prefix="specimen" onSelect={() => {}} /><div id="specimen-description" role="tabpanel" aria-labelledby="specimen-tab-description"><RevisionOverview revs={revisionFixture} readOnly /></div></div>
        </section>
        <div class="specimens">
            <section><h2>Tabs and panel headers</h2><p>32px tab strips. Neutral selected surfaces. Full-width backgrounds and 1px structural dividers.</p><div class="sample"><PanelTabs items={[{ id: "timeline", label: "Timeline" }]} active="timeline" prefix="single" onSelect={() => {}} /><div id="single-timeline" role="tabpanel" aria-labelledby="single-tab-timeline"><PanelHeader><h3>Revision filter</h3><input aria-label="Example revset" value="all()" /></PanelHeader></div></div></section>
            <section><h2>Controls</h2><p>Independent toggles and exclusive choices share the workspace control components.</p><div class="control-example"><ToggleTray label="Example wrapping"><ToggleItem icon="corner-down-left" text="Wrap lines" label="Wrap example lines" on={wrap} onClick={() => wrap = !wrap} /></ToggleTray><button type="button">Refresh</button><button type="button" disabled>Unavailable</button></div></section>
            <section><h2>Selection</h2><p>Use a neutral surface and stronger text. Underlines and side stripes are prohibited for active tabs, navigation and selected rows. Focus uses a complete outline.</p><div class="row-example" role="listbox" aria-label="Example files"><button class="selection-item" role="option" aria-selected="true"><Icon name="file-text" />workspace.svelte</button><button class="selection-item" role="option" aria-selected="false"><Icon name="file-text" />global.css</button></div></section>
            <section><h2>Surfaces and type</h2><p>IBM Plex Sans for controls; JetBrains Mono for code. Semantic colors belong to changes and repository data.</p><div class="swatches">{#each ["ground", "surface", "raised", "text", "muted", "rule"] as token}<div><span style="background: var(--{token})"></span><code>--{token}</code></div>{/each}</div></section>
        </div>
    </main>
</div>

<style>
    #shell { height: 100%; overflow: auto; background: var(--ground); color: var(--text); font: var(--type-ui)/1.5 var(--stack-ui); pointer-events: auto; }
    .system-page { max-width: 1280px; margin: auto; padding: 32px; }
    .page-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 28px; }
    h1 { font-size: 24px; font-weight: 500; letter-spacing: -.025em; }
    h2, h3 { font-size: var(--type-ui); font-weight: 500; }
    p { color: var(--muted); }
    h1 + p { margin-top: 4px; }
    button { display: inline-flex; align-items: center; gap: 8px; min-height: 30px; padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); color: var(--text); cursor: pointer; }
    button:disabled { color: var(--text-disabled); cursor: default; }
    .workspace-example { display: grid; grid-template-columns: 208px minmax(0, 1fr); min-height: 300px; border: 1px solid var(--rule); background: var(--surface); }
    .navigation-example { border-inline-end: 1px solid var(--rule); background: var(--ground); }
    .navigation-content { padding: 8px; }
    .reader-example { min-width: 0; }
    [role="tabpanel"][hidden] { display: none; }
    .added { color: var(--positive); } .removed { color: var(--negative); }
    .code-example { overflow: auto; padding-block: 12px; pointer-events: auto; }
    .code-line { display: grid; grid-template-columns: 40px 24px 1fr; min-width: max-content; padding-inline-end: 12px; line-height: 26px; }
    .code-line > span { text-align: center; color: var(--muted); font-family: var(--stack-code); }
    .code-line.added { background: var(--diff-addition); } .code-line.removed { background: var(--diff-deletion); }
    textarea { display: block; resize: vertical; width: 100%; min-height: 200px; border: 0; border-radius: 0; padding: 12px; font: var(--type-code)/1.8 var(--stack-code); }
    .operation-example { padding: 16px; }
    .description-specimen { margin-block-start: 32px; }
    .description-specimen > p { margin-block: 6px 16px; color: var(--muted); }
    .description-sample { container: overview / inline-size; border: 1px solid var(--rule); background: var(--surface); }
    .specimens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; margin-block: 32px; }
    .specimens section > p { margin-block: 6px 16px; max-width: 54ch; }
    .sample { border: 1px solid var(--rule); background: var(--surface); }
    .sample input { flex: 1; }
    .control-example { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .row-example { display: grid; gap: 2px; }
    .row-example button { border: 0; background: transparent; text-align: start; }
    .swatches { display: flex; flex-wrap: wrap; gap: 16px; }
    .swatches > div { display: grid; gap: 6px; }
    .swatches span { width: 48px; height: 32px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
    @media (max-width: 700px) { .system-page { padding: 20px 16px; } .page-heading { align-items: start; } .page-heading button { flex-shrink: 0; } .workspace-example { grid-template-columns: minmax(0, 1fr); } .navigation-example { border-inline-end: 0; border-block-end: 1px solid var(--rule); } .specimens { grid-template-columns: minmax(0, 1fr); gap: 24px; } }
</style>
