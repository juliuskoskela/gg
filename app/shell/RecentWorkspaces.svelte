<script lang="ts">
    import { query } from "../ipc.js";
    import { repoConfigEvent } from "../stores.js";
    import type { RepoConfig } from "../messages/RepoConfig.js";

    interface Props {
        workspaces?: string[];
    }

    let { workspaces = [] }: Props = $props();

    async function openWorkspace(path: string) {
        const result = await query<RepoConfig>("query_workspace", { path });
        if (result.type === "data") {
            repoConfigEvent.set(result.value);
        } else {
            repoConfigEvent.set({
                type: "LoadError",
                absolute_path: path,
                message: result.message,
            });
        }
    }
</script>

{#if workspaces.length > 0}
    <h3>Recent workspaces</h3>
    <ul>
        {#each workspaces as workspace}
            <li>
                <button onclick={() => openWorkspace(workspace)} title="Open this workspace">
                    {workspace}
                </button>
            </li>
        {/each}
    </ul>
{/if}

<style>
    h3 { grid-column: 1/-1; font-size: 13px; color: var(--muted); }
    ul { grid-column: 1/-1; list-style: none; display: grid; gap: 4px; }
    button { background: transparent; border: 0; border-radius: var(--radius-control); color: var(--text); cursor: pointer; font-family: var(--stack-ui); font-size: var(--type-ui); min-height: 32px; padding: 6px 8px; text-align: start; overflow-wrap: anywhere; width: 100%; }
    @media (hover: hover) { button:hover { background: var(--hover); } }
    button:active { background: var(--control-pressed); }
    @media (pointer: coarse), (max-width: 600px) { button { min-height: 44px; } }
</style>
