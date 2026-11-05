<script lang="ts">
    import ToggleTray from "../app/controls/ToggleTray.svelte";
    import ToggleItem from "../app/controls/ToggleItem.svelte";
    import DiffDisplayOptions from "../app/revision/DiffDisplayOptions.svelte";

    let reader: "diff" | "edit" = "diff";
    let tree = false;
    // tokens hang off #shell, so each theme panel needs its own; duplicate ids are tolerable on a dev canvas
    let themes = ["dark", "light"] as const;
</script>

<main class="canvas">
    {#each themes as theme}
        <div id="shell" class={theme}>
            <section class="panel" aria-label="{theme} theme">
                <h2>{theme === "dark" ? "Dark" : "Light"}</h2>

                <h3>In context</h3>
                <div class="row context">
                    <span class="title">Show complete file context in the diff reader</span>
                    <ToggleTray label="File presentation">
                        <ToggleItem text="Diff" on={reader === "diff"} onClick={() => reader = "diff"} />
                        <ToggleItem text="Edit" on={reader === "edit"} onClick={() => reader = "edit"} />
                    </ToggleTray>
                    <ToggleTray label="Changed files"><ToggleItem kind="disclosure" text="Tree" label="File tree" on={tree} onClick={() => tree = !tree} /></ToggleTray>
                </div>
                <div class="row context">
                    <span class="title muted">Changes</span>
                    <DiffDisplayOptions />
                </div>

                <h3>States</h3>
                <div class="grid">
                    <figure><ToggleTray label="Off"><ToggleItem text="Tree" kind="disclosure" /></ToggleTray><figcaption>Off</figcaption></figure>
                    <figure><ToggleTray label="On"><ToggleItem text="Tree" kind="disclosure" on /></ToggleTray><figcaption>On</figcaption></figure>
                    <figure><ToggleTray label="Disabled"><ToggleItem text="Tree" kind="disclosure" disabled /></ToggleTray><figcaption>Disabled</figcaption></figure>
                    <figure><ToggleTray label="Disabled on"><ToggleItem text="Tree" kind="disclosure" on disabled /></ToggleTray><figcaption>Disabled, on</figcaption></figure>
                    <figure><ToggleTray label="Small" size="sm"><ToggleItem text="Diff" on /><ToggleItem text="Edit" /></ToggleTray><figcaption>Small · 28</figcaption></figure>
                    <figure><ToggleTray label="Medium" size="md"><ToggleItem text="Diff" on /><ToggleItem text="Edit" /></ToggleTray><figcaption>Medium · 32</figcaption></figure>
                </div>
                <p class="note">Hover, press and keyboard focus are live — try them here.</p>

                <h3>Geometry at 4×</h3>
                <div class="zoom">
                    <ToggleTray label="Zoomed segmented">
                        <ToggleItem text="Diff" on />
                        <ToggleItem text="Edit" />
                    </ToggleTray>
                    <DiffDisplayOptions />
                    <ToggleTray label="Zoomed solo"><ToggleItem text="Tree" kind="disclosure" on /></ToggleTray>
                </div>
                <p class="note">Switch: the lit side fills its half · Multi: hairline dividers, each segment lights independently · radius 8</p>
            </section>
        </div>
    {/each}
</main>

<style>
    .canvas { display: grid; grid-template-columns: 1fr 1fr; min-height: 100dvh; }
    .panel { height: 100%; padding: 32px 40px 48px; background: var(--surface); color: var(--text); font: 400 var(--type-ui)/1.5 var(--stack-ui); }
    h2 { margin: 0 0 24px; font-size: var(--type-body); font-weight: 500; color: var(--text-strong); }
    h3 { margin: 32px 0 12px; font-size: var(--type-caption); font-weight: 500; color: var(--muted); }
    .row { display: flex; align-items: center; gap: 6px; }
    .context { padding: 3px 8px; min-height: 36px; border-block-end: 1px solid var(--rule); }
    .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 20px 16px; }
    figure { margin: 0; display: grid; justify-items: start; gap: 8px; }
    figcaption { font-size: var(--type-caption); color: var(--muted); }
    .note { margin: 12px 0 0; font-size: var(--type-caption); color: var(--faint); }
    /* zoom scales the gap as well */
    .zoom { display: flex; flex-wrap: wrap; align-items: start; gap: 6px; zoom: 4; }
</style>
