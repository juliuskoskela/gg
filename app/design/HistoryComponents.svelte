<script lang="ts">
    import Badge from "../controls/Badge.svelte";
    import SectionHeading from "../controls/SectionHeading.svelte";
    import ActionWidget from "../controls/ActionWidget.svelte";
    import LogList from "../controls/LogList.svelte";
    import MetadataList from "../controls/MetadataList.svelte";
    import MetadataRow from "../controls/MetadataRow.svelte";
    import DetailHeader from "../history/DetailHeader.svelte";
    import RefLine from "../history/RefLine.svelte";
    import RevisionLines from "../history/RevisionLines.svelte";
    import { operationKind } from "../history/operationKind";
    import type { HistoryRevision } from "../messages/HistoryRevision";

    let descriptions = ["snapshot working copy", "describe commit mzylkloup", "new empty commit", "rebase commit qpvuntsm and descendants", "push all bookmarks to git remote origin", "abandon commit kkmpptxz", "undo operation 4e1a90bc", "add workspace 'review'"];
    let rows = descriptions.map((title, index) => ({ id: String(index), title, code: `0${index}c4e1a9`, who: "default", time: "2026-11-05T14:30:00Z", kind: operationKind(title), ...(index === 0 ? { badge: "Latest" } : {}) }));
    let selected = $state("1");

    let ids = (change: string, commit: string) => ({
        change: { type: "ChangeId" as const, hex: change, prefix: change.slice(0, 2), rest: change.slice(2), offset: null, is_divergent: false },
        commit: { type: "CommitId" as const, hex: commit, prefix: commit.slice(0, 2), rest: commit.slice(2) },
    });
    let author = { name: "Julius Koskela", email: "julius@example.com", timestamp: "2026-11-05T14:30:00Z" };
    let revisions: HistoryRevision[] = [
        { id: ids("mzylkloupvzx", "a1b2c3d4e5f6a7b8"), description: { lines: ["Merge the review branch"] }, author, parent_ids: ["b2c3d4e5f6a7b8c9", "c3d4e5f6a7b8c9d0"], has_conflict: false },
        { id: ids("qpvuntsmwlqt", "b2c3d4e5f6a7b8c9"), description: { lines: ["Keep recovery within reach"] }, author, parent_ids: ["d4e5f6a7b8c9d0e1"], has_conflict: true },
        { id: ids("kkmpptxzrspx", "c3d4e5f6a7b8c9d0"), description: { lines: [""] }, author, parent_ids: ["d4e5f6a7b8c9d0e1"], has_conflict: false },
        { id: ids("rlvkpntzqxmw", "d4e5f6a7b8c9d0e1"), description: { lines: ["Align panel tools with the timeline"] }, author, parent_ids: [], has_conflict: false },
    ];
    let revision = $state("b2c3d4e5f6a7b8c9");
</script>

<div class="specimens">
    <div class="specimen"><SectionHeading title="Bookmarks" count={3}>{#snippet actions()}<ActionWidget onClick={() => {}}>Compare versions</ActionWidget>{/snippet}</SectionHeading><SectionHeading title="Working copies" count={1} /></div>
    <div class="specimen"><DetailHeader title="describe commit mzylkloup" pills={[{ label: "Latest" }, { label: "Read only", tone: "muted" }, { label: "Conflicted", tone: "warning" }]} />
        <MetadataList label="Specimen metadata"><MetadataRow label="Operation"><span class="id">4e1a90bc27d1</span></MetadataRow><MetadataRow label="By">julius on workstation</MetadataRow></MetadataList></div>
    <div class="specimen"><LogList label="Operation kinds" {rows} {selected} onSelect={id => selected = id} /></div>
    <div class="specimen" role="list" aria-label="Reference lines">
        <RefLine kind="workspace" name="default" ids={["a1b2c3d4e5f6a7b8"]} onInspect={() => {}} />
        <RefLine kind="bookmark" name="main" ids={["b2c3d4e5f6a7b8c9"]} removed={["d4e5f6a7b8c9d0e1"]} onInspect={() => {}} />
        <RefLine kind="bookmark" name="release" ids={["c3d4e5f6a7b8c9d0", "a1b2c3d4e5f6a7b8"]} conflicted />
    </div>
    <div class="specimen"><RevisionLines {revisions} heads={["a1b2c3d4e5f6a7b8"]} selected={revision} onSelect={item => revision = item.id.commit.hex} /></div>
    <div class="specimen"><Badge>Latest</Badge> <Badge tone="muted">Read only</Badge> <Badge tone="warning">Concurrent merge</Badge></div>
</div>

<style>
    .specimens { display: grid; gap: var(--gap-section); max-width: 560px; }
    .specimen { padding: var(--space-2); border: 1px solid var(--view-inner-rule); background: var(--surface); }
    .id { font: var(--font-id); }
</style>
