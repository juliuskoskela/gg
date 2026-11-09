<script lang="ts">
    import type { RepoConfig } from "../messages/RepoConfig";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import TextField from "../controls/TextField.svelte";
    import ErrorDialog from "./ErrorDialog.svelte";
    import RecentWorkspaces from "./RecentWorkspaces.svelte";

    let { config, desktop, recentWorkspaces, onOpen, onChoose, onInitialize, onClone, onReopen }: {
        config: Extract<RepoConfig, { type: "LoadError" }>;
        desktop: boolean;
        recentWorkspaces: string[];
        onOpen: (path: string) => void;
        onChoose: () => void;
        onInitialize: (path?: string) => void;
        onClone: () => void;
        onReopen: () => void;
    } = $props();
    let path = $state("");
    $effect(() => { path = config.absolute_path; });
</script>

<ErrorDialog title={config.git_root ? "Jujutsu setup needed" : "No workspace loaded"}>
    {#if config.git_root}
        <p>This is a Git repository without a Jujutsu workspace. Set up Jujutsu alongside Git to open it in GG+.</p>
        <p><code>{config.git_root}</code></p>
        {#if desktop}
            <ActionWidget safe primary onClick={() => onInitialize(config.git_root)}>Set up Jujutsu…</ActionWidget>
        {:else}
            <p>From this folder, run <code>jj git init --colocate</code>, then open the workspace again.</p>
        {/if}
    {:else}
        <p>Open a Jujutsu repository to start working in GG+.</p>
    {/if}
    <p class="workspace-error" role="status">{config.message}</p>
    <label for="workspace-path">Repository path</label>
    <TextField id="workspace-path" bind:value={path} placeholder="/path/to/repository" onkeydown={(event) => { if (event.key === "Enter" && path.trim()) onOpen(path.trim()); }} />
    <ActionWidget safe primary={!config.git_root} disabled={!path.trim()} onClick={() => onOpen(path.trim())}>Open workspace</ActionWidget>
    {#if desktop}
        <ActionWidget safe onClick={onChoose}>Choose repository…</ActionWidget>
        {#if !config.git_root}<ActionWidget safe onClick={() => onInitialize()}>Initialize repository…</ActionWidget>{/if}
        <ActionWidget safe onClick={onClone}>Clone repository…</ActionWidget>
        <ActionWidget safe onClick={onReopen}>Reopen repository</ActionWidget>
    {/if}
    <RecentWorkspaces workspaces={recentWorkspaces} />
</ErrorDialog>
