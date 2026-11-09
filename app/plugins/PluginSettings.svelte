<script lang="ts">
    import { pluginHost } from "./runtime";
    import type { Capability } from "./types";
    let { host = pluginHost }: { host?: typeof pluginHost } = $props();
    let states = $derived(host.statuses);
    let permissions: Record<Capability, string> = {
        "queries.read": "Read repository history and diffs",
        "annotations.read": "Read local annotations",
        "reviews.read": "Read review progress",
        storage: "Save its own local data",
        "facts.publish": "Publish local activity",
    };
</script>

<section aria-labelledby="plugins-heading">
    <h2 id="plugins-heading">Bundled plugins</h2>
    {#if !$states.length}<p>No bundled plugins are included in this build.</p>{/if}
    {#each $states as plugin (plugin.manifest.id)}
        <div class="plugin">
            <label><input type="checkbox" checked={plugin.enabled} aria-describedby={`plugin-${plugin.manifest.id}-description`} onchange={event => host.enable(plugin.manifest.id, event.currentTarget.checked)} />{plugin.manifest.name}</label>
            <p id={`plugin-${plugin.manifest.id}-description`}>{plugin.manifest.description}</p>
            <p>{plugin.manifest.version} · {plugin.active ? "Active" : plugin.error ? "Unavailable" : plugin.starting ? "Starting…" : plugin.enabled ? "Waiting for a repository" : "Disabled"}</p>
            {#if plugin.manifest.capabilities.length}
                <details><summary>Permissions</summary><ul>{#each plugin.manifest.capabilities as capability}<li>{permissions[capability]}</li>{/each}</ul></details>
            {/if}
            {#if plugin.error}<p role="alert">{plugin.error}</p>{/if}
        </div>
    {/each}
</section>

<style>
    section { padding-block: var(--gap-section); border-block-start: 1px solid var(--rule); }
    h2 { margin: 0 0 var(--gap-group); font: var(--font-heading); }
    .plugin + .plugin { margin-block-start: var(--gap-section); }
    p, details { color: var(--muted); font: var(--font-label); }
    label { display: flex; align-items: center; gap: var(--control-gap); font: var(--font-body); }
</style>
