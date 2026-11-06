<script lang="ts">
    import { focusModality } from "../display/focus";
    import { effectiveTheme, themePreference, themeFamily, themeFamilies, darkDepth } from "../display/theme";
    import { setContext } from "svelte";
    import RevisionTools from "../revision/RevisionTools.svelte";
    import RevisionOverview from "../revision/RevisionOverview.svelte";
    import { revisionFixture } from "./revisionFixture";
    import TextField from "../controls/TextField.svelte";
    import TextAreaField from "../controls/TextAreaField.svelte";
    import EditableText from "../controls/EditableText.svelte";
    import PanelTabs from "../controls/PanelTabs.svelte";
    import PanelHeader from "../controls/PanelHeader.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import ProgressWidget from "../controls/ProgressWidget.svelte";
    import DiffViewer from "../DiffViewer.svelte";
    import Icon from "../controls/Icon.svelte";
    import ToggleTray from "../controls/ToggleTray.svelte";
    import ToggleItem from "../controls/ToggleItem.svelte";
    import DiffTools from "../revision/DiffTools.svelte";
    import TimelineDisplayOptions from "../timeline/TimelineDisplayOptions.svelte";
    import PanelFooter from "../controls/PanelFooter.svelte";
    import TimelineSection from "../timeline/TimelineSection.svelte";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import type { RevChange } from "../messages/RevChange";
    import HistoryColors from "./HistoryColors.svelte";
    import RepositoryNavigation from "../shell/RepositoryNavigation.svelte";

    setContext("settings", { markUnpushedBookmarks: true });
    $: theme = $effectiveTheme;
    let active = "diff";
    let currentQuery = "all()";
    let wrap = true;
    let editingSample = false;
    let sampleDescription = "Keep revision descriptions readable";
    let sampleSearch = "";
    let sampleQuery = "all()";
    let sampleRemote = "origin";
    let samplePreset = "custom";
    let timelineExample: HTMLDivElement;
    let sampleChanges: RevChange[] = [{ kind: "Modified", path: { repo_path: "app/workspace.ts", relative_path: "app/workspace.ts" }, has_conflict: false, hunks: [{ location: { from_file: { start: 1, len: 6 }, to_file: { start: 1, len: 6 } }, lines: { lines: [' import PanelTabs from "./controls/PanelTabs.svelte";\n', ' \n', '-let selection = "underline";\n', '+let selection = "surface";\n', ' let panels = ["Timeline", "Diff", "Edit"];\n', ' // Keep the active panel visible.\n', ' function selectPanel(index: number = 0) { return panels[index]; }\n'] } }], stat: { added: 1, removed: 1 } }];
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

<div id="shell" use:focusModality class={theme} data-theme-family={$themeFamily} data-dark-depth={$darkDepth}>
    <main class="system-page">
        <header class="page-heading"><div><h1>GG+ design system</h1><p>Shared components for the revision workspace.</p></div><div class="gallery-theme-controls"><SelectWidget label="Color family" value={$themeFamily} options={themeFamilies.map(family => ({ value: family.id, label: family.label }))} on:change={event => themeFamily.set((event.detail.target as HTMLSelectElement).value as import("../display/theme").ThemeFamily)} let:option>{option.label}</SelectWidget><SelectWidget label="Dark depth" value={$darkDepth} options={[{ value: "twilight", label: "Twilight" }, { value: "midnight", label: "Midnight" }]} on:change={event => darkDepth.set((event.detail.target as HTMLSelectElement).value as import("../display/theme").DarkDepth)} let:option>{option.label}</SelectWidget><button type="button" on:click={() => themePreference.set(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun" : "moon"} />{theme === "dark" ? "Light" : "Dark"} theme</button></div></header>
        <section id="panel-spacing" class="spacing-specimen" aria-labelledby="spacing-heading">
            <h2 id="spacing-heading">Panel structure and spacing</h2>
            <p>Each tab pairs its label with its own close button. Tools align to the trailing edge. The Diff header below and Timeline specimen use the production components.</p>
            <dl class="spacing-rules">
                <div><dt>Panel inset</dt><dd>12px</dd></div>
                <div><dt>Adjacent controls</dt><dd>8px</dd></div>
                <div><dt>Tool groups</dt><dd>12px</dd></div>
                <div><dt>Title padding</dt><dd>5px above and below</dd></div>
                <div><dt>Controls</dt><dd>28px; 44px on touch</dd></div>
                <div><dt>Title bar</dt><dd>40px; 56px on touch</dd></div>
            </dl>
            <p>A single view has a plain title; tabs appear only for stacked views. Tools stay on the title or tab row at every width. Overflowing tabs scroll beneath the fixed tools; keyboard navigation reveals the active tab. Header backgrounds and divider lines span the full panel width.</p>
        </section>
        <section class="workspace-example" aria-label="Workspace components">
            <aside class="navigation-example"><PanelHeader><h2>Repository</h2></PanelHeader><div class="navigation-content"><RepositoryNavigation {workspace} {currentQuery} onSelect={value => currentQuery = value} onWorkingCopy={() => currentQuery = "@"} /></div></aside>
            <div class="reader-example">
                <PanelTabs {items} {active} prefix="example" toolsVisible={active === "diff"} onSelect={id => active = id} onClose={id => { items = items.filter(item => item.id !== id); if (active === id) active = items[0]?.id ?? ""; }}><svelte:fragment slot="tools">{#if active === "diff"}<DiffTools changes={sampleChanges} />{/if}</svelte:fragment></PanelTabs>
                {#each items as item}
                    <div id="example-{item.id}" role={items.length > 1 ? "tabpanel" : "region"} aria-labelledby="example-tab-{item.id}" hidden={active !== item.id}>
                        {#if item.id === "diff"}
                            <div class="diff-example"><DiffViewer change={sampleChanges[0]} themeOverride={theme} /></div><PanelFooter><div class="example-file-navigation"><Icon name="chevron-up" /><Icon name="chevron-down" /><Icon name="file-text" /><span>app/workspace.ts</span></div></PanelFooter>
                        {:else if item.id === "edit"}<PanelHeader><Icon name="file-text" /><span>app/workspace.ts</span></PanelHeader><TextAreaField label="Example editor" spellcheck="false" value={rows.filter(row => row.kind !== "removed").map(row => row.text).join("\n")} />
                        {:else}<PanelHeader><h2>Current operation</h2></PanelHeader><p class="operation-example">No pending operation in this component preview.</p>{/if}
                    </div>
                {/each}
                {#if !items.length}<p class="operation-example">No views open. <button type="button" on:click={() => { items = [{ id: "diff", label: "Diff" }, { id: "edit", label: "Edit" }, { id: "operation", label: "Operation" }]; active = "diff"; }}>Restore views</button></p>{/if}
            </div>
        </section>
        <section id="history-colors" class="description-specimen"><h2>History colors</h2><p>Text-grade lane colors are shared by graph stations and revision prefixes. Workspaces use GG+ blue in every family.</p><HistoryColors /></section>
        <section id="description" class="description-specimen" aria-label="Description component preview">
            <h2>Description and metadata</h2><p>One document, aligned fields, and wrapping references. This specimen uses the production description components.</p>
            <div class="description-sample"><PanelTabs items={[{ id: "description", label: "Description" }]} active="description" prefix="specimen" onSelect={() => {}} /><div id="specimen-description" role="region" aria-labelledby="specimen-tab-description"><RevisionOverview revs={revisionFixture} readOnly /></div></div>
        </section>
        <div class="specimens">
            <section><h2>Timeline panel</h2><p>Tools stay at the trailing edge of the title bar. Preset and filter fields stay at the bottom, outside the graph's scroll area.</p><div class="sample"><PanelTabs items={[{ id: "timeline", label: "Timeline" }]} active="timeline" prefix="single" onSelect={() => {}}><svelte:fragment slot="tools"><TimelineDisplayOptions /></svelte:fragment></PanelTabs><div class="timeline-example" id="single-timeline" role="region" aria-labelledby="single-tab-timeline"><TimelineSection showHeader={false} bind:element={timelineExample}><span slot="summary">2 revisions</span><div class="timeline-example-rows"><p>Keep revision descriptions readable</p><p>Unify panel chrome</p></div><div slot="footer" class="timeline-example-fields"><SelectWidget options={[{ label: "Default", value: "all()" }]} bind:value={sampleQuery}><svelte:fragment let:option>{option.label}</svelte:fragment></SelectWidget><TextField label="Example revset" bind:value={sampleQuery} /></div></TimelineSection></div></div></section>
            <section><h2>Controls</h2><p>Independent toggles and exclusive choices share the workspace control components.</p><div class="control-example"><ToggleTray label="Example wrapping"><ToggleItem icon="corner-down-left" text="Wrap lines" label="Wrap example lines" on={wrap} onClick={() => wrap = !wrap} /></ToggleTray><ActionWidget onClick={() => {}}><Icon name="refresh-cw" />Refresh</ActionWidget><ActionWidget primary onClick={() => {}}>Save description</ActionWidget><ActionWidget disabled disabledReason="Select a revision first" onClick={() => {}}>Unavailable</ActionWidget></div></section>
            <section><h2>Revision tools</h2><p>Commands live in their own dockable panel, available from Views. They follow the selected revision.</p><div class="tools-specimen"><PanelTabs items={[{ id: "tools", label: "Revision tools" }]} active="tools" prefix="tools-specimen" onSelect={() => {}} /><div id="tools-specimen-tools" role="region" aria-labelledby="tools-specimen-tab-tools"><RevisionTools headers={[]} /></div></div></section>
            <section id="selects"><h2>Dropdowns</h2><p>Remote and revset choices use the same native select, inset Feather chevron and keyboard behavior.</p><div class="control-example"><SelectWidget label="Example remote" options={[{ value: "origin" }, { value: "upstream" }]} bind:value={sampleRemote} /><SelectWidget label="Example preset" options={[{ value: "custom", label: "Custom" }, { value: "default", label: "Default" }]} bind:value={samplePreset}><svelte:fragment let:option>{option.label}</svelte:fragment></SelectWidget></div></section>
            <section class="field-specimens"><h2>Fields and inline editing</h2><p>Text, search and multiline fields share native behavior and the same surface, border and focus tokens.</p><TextField label="Example search" type="search" placeholder="Find a file…" bind:value={sampleSearch} />
                {#if editingSample}<TextAreaField label="Example description" bind:value={sampleDescription} /><button type="button" on:click={() => editingSample = false}>Done</button>{:else}<EditableText text={sampleDescription} label="Edit example description" onEdit={() => editingSample = true} />{/if}
                <TextAreaField label="Empty working-copy example" placeholder="Describe this change…" />
            </section>
            <section><h2>Selection</h2><p>Use a neutral surface and stronger text. Underlines and side stripes are prohibited for active tabs, navigation and selected rows. Focus uses a complete outline.</p><div class="row-example" role="listbox" aria-label="Example files"><button class="selection-item" role="option" aria-selected="true"><Icon name="file-text" />workspace.svelte</button><button class="selection-item" role="option" aria-selected="false"><Icon name="file-text" />global.css</button></div></section>
            <section id="states"><h2>Feedback and field states</h2><p>Production controls retain native hover, keyboard focus and pressed behavior. Tab through this page to inspect focus in either theme.</p><div class="state-fields"><TextField label="Disabled field" value="Unavailable while loading" disabled /><TextField label="Invalid revset" value="ancestors(" aria-invalid="true" aria-describedby="example-error" /><p id="example-error" class="error-text">Close the parenthesis to complete this revset.</p><ProgressWidget label="Loading revisions…" /><ProgressWidget label="3 of 4 files loaded" value={75} /><p role="status">No matching files. Try a different file name.</p></div></section>
            <section><h2>Surfaces and type</h2><p>IBM Plex Sans for controls; JetBrains Mono for code. Semantic colors belong to changes and repository data.</p><div class="swatches">{#each ["ground", "surface", "raised", "text", "muted", "rule"] as token}<div><span style="background: var(--{token})"></span><code>--{token}</code></div>{/each}</div></section>
        </div>
    </main>
</div>

<style>
    @import "../controls/action.css";
    #shell { height: 100%; overflow: auto; background: var(--ground); color: var(--text); font: var(--type-ui)/1.5 var(--stack-ui); pointer-events: auto; }
    .system-page { max-width: 1280px; margin: auto; padding: 32px; }
    .page-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 28px; }
    .gallery-theme-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: end; gap: 8px; pointer-events: auto; }
    h1 { font-size: 24px; font-weight: 500; letter-spacing: -.025em; }
    h2 { font-size: var(--type-ui); font-weight: 500; }
    p { color: var(--muted); }
    h1 + p { margin-top: 4px; }
    .state-fields { display: grid; gap: 12px; }
    .error-text { color: var(--negative); }
    .diff-example { height: 220px; overflow: hidden; }
    .spacing-specimen { margin-block-end: 24px; }
    .spacing-specimen > p { max-width: 80ch; margin-block: 6px 12px; }
    .spacing-rules { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-block: 16px; }
    .spacing-rules > div { display: grid; gap: 2px; }
    .spacing-rules dt { color: var(--muted); }
    .spacing-rules dd { margin: 0; color: var(--text); font-variant-numeric: tabular-nums; }
    .workspace-example { display: grid; grid-template-columns: 208px minmax(0, 1fr); min-height: 300px; border: 1px solid var(--rule); background: var(--surface); }
    .navigation-example { border-inline-end: 1px solid var(--rule); background: var(--ground); }
    .navigation-content { padding: 8px; }
    .reader-example { min-width: 0; }
    [role="tabpanel"][hidden] { display: none; }

    .reader-example :global(textarea) { display: block; min-height: 200px; border: 0; border-radius: 0; padding: 12px; font: var(--type-code)/1.8 var(--stack-code); }
    .operation-example { padding: 16px; }
    .description-specimen { margin-block-start: 32px; }
    .description-specimen > p { margin-block: 6px 16px; color: var(--muted); }
    .description-sample { container: overview / inline-size; border: 1px solid var(--rule); background: var(--surface); }
    .specimens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; margin-block: 32px; }
    .specimens section > p { margin-block: 6px 16px; max-width: 54ch; }
    .sample { border: 1px solid var(--rule); background: var(--surface); }
    .timeline-example { display: grid; height: 220px; }
    .timeline-example-rows { display: grid; align-content: start; gap: 8px; padding-block: 8px; }
    .example-file-navigation { display: flex; align-items: center; gap: var(--panel-gap); min-height: var(--control-height); }
    .timeline-example-fields { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: var(--panel-gap); }
    .tools-specimen { max-height: 440px; overflow: auto; border: 1px solid var(--rule); pointer-events: auto; }
    .field-specimens { display: flex; flex-direction: column; align-items: start; gap: 12px; }
    .field-specimens > :global(input), .field-specimens > :global(textarea) { width: 100%; }
    .control-example { display: flex; align-items: center; flex-wrap: wrap; gap: var(--panel-gap); }
    .row-example { display: grid; gap: 2px; }
    .row-example button { border: 0; background: transparent; text-align: start; }
    .swatches { display: flex; flex-wrap: wrap; gap: 16px; }
    .swatches > div { display: grid; gap: 6px; }
    .swatches span { width: 48px; height: 32px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
    @media (max-width: 700px) { .system-page { padding: 20px 16px; } .page-heading { align-items: start; } .page-heading button { flex-shrink: 0; } .workspace-example { grid-template-columns: minmax(0, 1fr); } .navigation-example { border-inline-end: 0; border-block-end: 1px solid var(--rule); } .specimens { grid-template-columns: minmax(0, 1fr); gap: 24px; } }
</style>
