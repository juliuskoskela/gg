<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import type { PluginAPI } from "../types";
    import type { ReviewController, ReviewState } from "./controller";
    import type { SessionState } from "./model";
    import { member } from "./model";
    import { capture, listSnapshots, loadSnapshot, MAX_SNAPSHOT_BYTES, parseSnapshot, saveSnapshot, snapshotTitle, stringifySnapshot, type ReviewSnapshot } from "./snapshot";
    interface Props { api: PluginAPI; controller: ReviewController; session?: SessionState; currentState: ReviewState; onOpen: (snapshot: ReviewSnapshot) => void; }
    let { api, controller, session, currentState, onOpen }: Props = $props();
    let library = $state<{ id: string; title: string }[]>([]);
    let busy = $state(false);
    let error = $state("");
    let alive = true;
    let urls = new Set<string>();
    let timers = new Set<ReturnType<typeof setTimeout>>();
    onDestroy(() => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); timers.forEach(timer => clearTimeout(timer)); });
    async function refresh() { let list = await listSnapshots(api); if (alive) library = list; }
    $effect(() => { let client = api; untrack(() => void listSnapshots(client).then(list => { if (alive) library = list; }).catch(problem => { if (alive) error = String(problem); })); });
    async function run(action: () => Promise<void>) {
        if (busy) return;
        busy = true; error = "";
        try { await action(); } catch (problem) { if (alive) error = String(problem); }
        finally { if (alive) busy = false; }
    }
    async function exporting() {
        if (!session) return;
        let snapshot = await capture(api, session, controller.events(session.id), session.members.flatMap(item => {
            let header = currentState.current.get(item.changeId); return header ? [member(header)] : [];
        }));
        await saveSnapshot(api, snapshot);
        await refresh();
        if (!alive) return;
        let url = URL.createObjectURL(new Blob([stringifySnapshot(snapshot)], { type: "application/json" }));
        urls.add(url);
        let link = document.createElement("a");
        link.href = url; link.download = `${snapshotTitle(snapshot).replace(/[^a-z0-9_-]+/gi, "-") || "review"}.gg.review`;
        link.click();
        let timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer); }, 5000);
        timers.add(timer);
    }
    async function importing(event: Event) {
        let input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
        if (!file) return;
        await run(async () => {
            if (file.size > MAX_SNAPSHOT_BYTES) throw new Error("Review snapshot exceeds the 32 MiB limit");
            let snapshot = parseSnapshot(await file.text());
            await saveSnapshot(api, snapshot);
            await refresh();
            if (alive) onOpen(snapshot);
        });
        input.value = "";
    }
</script>
<details class="snapshot-tools">
    <summary>Snapshots</summary>
    <p class="muted">Capture exact code and notes for offline review. Importing a snapshot does not mark current files as reviewed.</p>
    <div class="snapshot-actions">
        <button type="button" disabled={busy || !session} onclick={() => run(exporting)}>Export snapshot</button>
        <label>Open snapshot file<input type="file" accept=".gg.review,.json,application/json" disabled={busy} onchange={importing} /></label>
        <button type="button" disabled={busy} onclick={() => run(refresh)}>Refresh saved snapshots</button>
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if library.length}
        <ul aria-label="Saved review snapshots">{#each library as saved (saved.id)}<li><button type="button" disabled={busy} onclick={() => run(async () => { let snapshot = await loadSnapshot(api, saved.id); if (alive) onOpen(snapshot); })}>{saved.title}</button></li>{/each}</ul>
    {/if}
</details>
<style>
    @import "../../controls/action.css";
    .snapshot-tools { border-block: 1px solid var(--border); padding-block: var(--space-3); }
    summary { pointer-events: auto; cursor: pointer; font: var(--font-body); }
    .snapshot-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-group); }
    .muted { color: var(--muted); }
    label { display: grid; gap: var(--gap-row); font: var(--font-label); }
</style>
