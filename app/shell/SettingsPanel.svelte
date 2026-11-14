<script lang="ts">
    import PluginSettings from "../plugins/PluginSettings.svelte";
    import { effectiveTheme, effectiveAppearance, setAppearance, useDefaultAppearance, themePreference, colorVision, colorVisions, type ColorVision } from "../display/theme";
    import { appZoom, nativeZoomEnabled, zoomCommands } from "../display/zoom";
    import { mutationPending } from "../operations";
    import { currentMutation, ignoreToggled, repoStatusEvent } from "../stores";
    import ToggleWidget from "../controls/ToggleWidget.svelte";
    import SelectWidget from "../controls/SelectWidget.svelte";
    import ThemeFamilyPicker from "../display/ThemeFamilyPicker.svelte";
    import Icon from "../controls/Icon.svelte";
    import { BOTTOM_TOOLS, bottomToolbar, bottomToolFor, isBottomToolId, isDefaultBottomToolbar, type BottomToolbarSide, type BottomToolId } from "./bottomToolbar";

    let busy = $derived(!!$currentMutation || $mutationPending);
    let zoom = $derived(zoomCommands($appZoom, $nativeZoomEnabled));
    let vision = $derived(colorVisions.find(option => option.id === $colorVision) ?? colorVisions[0]);
    let availableTools = $derived(BOTTOM_TOOLS.filter(tool => !$bottomToolbar.left.includes(tool.id) && !$bottomToolbar.right.includes(tool.id)));
    let selectedTool = $state<BottomToolId>("refresh");
    $effect.pre(() => {
        if (availableTools.length && !availableTools.some(tool => tool.id === selectedTool)) {
            selectedTool = availableTools[0].id;
        }
    });

    function addTool(side: BottomToolbarSide) {
        if (isBottomToolId(selectedTool)) bottomToolbar.add(side, selectedTool);
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (settings scroll independently of the dock) -->
<div class="settings-panel" role="region" aria-label="Settings preferences" tabindex="0">
    <div class="settings-content">
        <section aria-labelledby="appearance-heading">
            <h2 id="appearance-heading">Appearance</h2>
            <ThemeFamilyPicker />
            <div class="setting-row appearance-row">
                <div class="setting-copy"><h3>Light level</h3><p>Choose a light workspace or one of two dark depths.</p></div>
                <div class="theme-choices" role="group" aria-label="Appearance">
                    <button type="button" aria-pressed={$effectiveAppearance === "light"} onclick={() => setAppearance("light")}><Icon name="sun" />Light</button>
                    <button type="button" aria-pressed={$effectiveAppearance === "twilight"} onclick={() => setAppearance("twilight")}><Icon name="sunset" />Twilight</button>
                    <button type="button" aria-pressed={$effectiveAppearance === "midnight"} onclick={() => setAppearance("midnight")}><Icon name="moon" />Midnight</button>
                </div>
            </div>
            <div class="appearance-default"><button type="button" onclick={useDefaultAppearance} disabled={$themePreference === null}>Use repository or system appearance</button>{#if $themePreference === null}<span>Automatic · {$effectiveTheme === "light" ? "Light" : $effectiveAppearance === "twilight" ? "Twilight" : "Midnight"}</span>{/if}</div>
            <div class="setting-row vision-row">
                <div class="setting-copy"><h3>Color vision</h3><p>{$colorVision === "typical" ? "Use the family’s own hues." : `${vision.description}. Hues are replaced with a palette checked against simulations of this vision, and diffs mark changed lines with + and −.`}</p></div>
                <div class="vision-choice"><SelectWidget label="Color vision" value={$colorVision} options={colorVisions.map(option => ({ value: option.id, label: option.label }))} onChange={event => colorVision.set((event.target as HTMLSelectElement).value as ColorVision)} >{#snippet children({ option })}{option.label}{/snippet}</SelectWidget></div>
            </div>
        </section>
        <section aria-labelledby="zoom-heading">
            <h2 id="zoom-heading">{$nativeZoomEnabled ? "App zoom" : "Browser zoom"}</h2>
            {#if $nativeZoomEnabled}
                <div class="setting-row">
                    <div class="setting-copy"><h3>Interface size</h3><p>{Math.round($appZoom.level * 100)}%{$appZoom.pending ? " · Applying…" : ""}</p></div>
                    <div class="zoom-controls" role="group" aria-label="App zoom">
                        {#each zoom as command}
                            <button type="button" aria-label={command.label} title={`${command.reason ?? command.label} (${command.shortcut})`} disabled={!!command.reason || $appZoom.pending} onclick={() => command.execute()}><Icon name={command.icon} />{#if command.id === "view.zoom-reset"}<span>100%</span>{/if}</button>
                        {/each}
                    </div>
                </div>
            {:else}
                <p class="browser-hint">Use your browser’s Zoom menu or <kbd>Ctrl/⌘ +</kbd> and <kbd>Ctrl/⌘ −</kbd> to change the interface size. Reset with <kbd>Ctrl/⌘ 0</kbd>.</p>
            {/if}
        </section>
        <section aria-labelledby="protection-heading">
            <h2 id="protection-heading">Repository protection</h2>
            <div class="setting-row protection" class:overriding={$ignoreToggled}>
                <div class="setting-copy"><h3 id="immutability-label">Override immutability</h3><p>Allow edits to revisions marked immutable.</p></div>
                <ToggleWidget tip="Override immutability" bind:checked={$ignoreToggled} disabled={busy} safe on="shield-off" off="shield" />
            </div>
        </section>
        <section aria-labelledby="toolbar-heading">
            <h2 id="toolbar-heading">Bottom toolbar</h2>
            <p>Choose which quick actions sit on the left and right of the bottom bar.</p>
            <div class="toolbar-sides">
                {#each (["left", "right"] as const) as side}
                    {@const items = $bottomToolbar[side]}
                    {@const otherSide = side === "left" ? "right" : "left"}
                    <div class="toolbar-side" role="group" aria-label="{side === 'left' ? 'Left' : 'Right'} toolbar tools">
                        <h3>{side === "left" ? "Left" : "Right"}</h3>
                        {#if items.length}
                            <ul class="toolbar-list">
                                {#each items as id, index (id)}
                                    {@const tool = bottomToolFor(id)}
                                    <li class="toolbar-item">
                                        <span class="toolbar-item-name"><Icon name={tool.icon} /><span>{tool.settingLabel}</span></span>
                                        <div class="toolbar-item-actions">
                                            <button type="button" aria-label="Move {tool.settingLabel} earlier" title="Move earlier" disabled={index === 0} onclick={() => bottomToolbar.move(id, -1)}><Icon name="chevron-up" /></button>
                                            <button type="button" aria-label="Move {tool.settingLabel} later" title="Move later" disabled={index === items.length - 1} onclick={() => bottomToolbar.move(id, 1)}><Icon name="chevron-down" /></button>
                                            <button type="button" aria-label="Move {tool.settingLabel} to {otherSide}" title="Move to {otherSide}" onclick={() => bottomToolbar.moveToSide(id, otherSide)}><span class="side-arrow"><Icon name={side === "left" ? "arrow-right" : "arrow-left"} /></span></button>
                                            <button type="button" aria-label="Remove {tool.settingLabel}" title="Remove from bottom toolbar" onclick={() => bottomToolbar.remove(id)}><Icon name="x" /></button>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {:else}
                            <p>No tools on the {side}.</p>
                        {/if}
                    </div>
                {/each}
            </div>
            {#if availableTools.length}
                <div class="toolbar-add">
                    <div class="toolbar-add-select">
                        <SelectWidget label="Tool to add" bind:value={selectedTool} options={availableTools.map(tool => ({ value: tool.id, label: `${tool.category}: ${tool.settingLabel}` }))}>{#snippet children({ option })}{option.label}{/snippet}</SelectWidget>
                    </div>
                    <button type="button" onclick={() => addTool("left")}><Icon name="plus" />Add left</button>
                    <button type="button" onclick={() => addTool("right")}><Icon name="plus" />Add right</button>
                </div>
            {/if}
            <div class="toolbar-reset">
                <button type="button" onclick={() => bottomToolbar.reset()} disabled={isDefaultBottomToolbar($bottomToolbar)}>Reset bottom toolbar</button>
            </div>
        </section>
        <PluginSettings />
        <section aria-labelledby="operation-heading">
            <h2 id="operation-heading">Current operation</h2>
            <p class="operation-description">{$repoStatusEvent?.operation_description ?? "No operation"}</p>
        </section>
    </div>
</div>

<style>
    .settings-panel { min-width: 0; min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; scroll-padding-block: 20px; pointer-events: auto; color: var(--text); background: var(--surface); }
    .settings-content { max-width: 720px; padding: 8px 20px 24px; }
    section { padding-block: 20px; }
    section + section { border-block-start: var(--line-width) solid var(--line-rule); }
    h2 { margin: 0 0 var(--gap-group); color: var(--text-strong); font: var(--font-heading); }
    h3 { margin: 0; color: var(--text); font: var(--font-emphasis); }
    p { max-width: var(--prose-measure); margin: 2px 0 0; color: var(--muted); font: var(--font-label); overflow-wrap: anywhere; }
    .setting-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }
    .appearance-row { margin-block-start: 20px; }
    .vision-row { margin-block-start: var(--gap-section); }
    .vision-choice { min-width: 180px; }
    .appearance-default { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block-start: 12px; color: var(--muted); font: var(--font-label); }
    .appearance-default button { border-color: transparent; padding-inline: 0; color: var(--muted); font-size: var(--type-caption); text-align: start; white-space: normal; }
    .setting-copy { flex: 1 1 200px; }
    .theme-choices, .zoom-controls { display: flex; align-items: center; gap: 4px; }
    button { display: inline-flex; align-items: center; justify-content: center; gap: var(--control-gap); min-height: var(--control-height); min-width: var(--control-height); padding: 5px 10px; border: var(--line-width) solid var(--line-control); border-radius: var(--radius-control); color: var(--text); background: transparent; font-size: var(--type-ui); cursor: pointer; }
    button[aria-pressed="true"] { background: var(--interaction-selected, var(--selection-bg)); color: var(--text); }
    @media (hover: hover) { button:not(:disabled):hover { background: var(--interaction-hover, var(--hover)); } button[aria-pressed="true"]:hover { background: var(--interaction-selected-hover, var(--selection-hover)); } }
    button:not(:disabled):active { background: var(--interaction-pressed, var(--control-pressed)); }
    button[aria-pressed="true"]:active { background: var(--interaction-selected-pressed, var(--active)); }
    button:disabled { color: var(--text-disabled); cursor: default; }
    .overriding h3 { color: var(--warning); }
    .browser-hint { margin: 0; max-width: 62ch; }
    kbd { white-space: nowrap; font: inherit; color: var(--text); }
    .operation-description { margin: 0; user-select: text; }
    .toolbar-sides { display: grid; gap: var(--gap-group); margin-block-start: var(--gap-group); }
    .toolbar-side { display: grid; gap: var(--gap-row); min-width: 0; }
    .toolbar-list { display: grid; gap: var(--gap-row); margin: 0; padding: 0; list-style: none; min-width: 0; }
    .toolbar-item { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-1) var(--space-2); padding: var(--space-1) var(--space-2); border: var(--line-width) solid var(--line-control); border-radius: var(--radius-control); min-width: 0; }
    .toolbar-item-name { display: inline-flex; align-items: center; gap: var(--control-gap); min-width: 0; font: var(--font-body); }
    .toolbar-item-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toolbar-item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-row); }
    .toolbar-item-actions button { padding: var(--space-1); }
    .toolbar-add { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-block-start: var(--gap-group); min-width: 0; }
    .toolbar-add-select { flex: 1 1 180px; min-width: 0; }
    .toolbar-add-select :global(select) { width: 100%; }
    .toolbar-reset { margin-block-start: var(--gap-group); }
    /* the toolbar mirrors in RTL, so moving to the other end points the other way */
    .side-arrow { display: inline-flex; }
    .side-arrow:dir(rtl) { transform: scaleX(-1); }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; min-width: 44px; } .settings-content { padding-inline: 16px; } }
</style>
