import type { RevChange } from "../messages/RevChange";
import type { FileCategory } from "../messages/FileCategory";

export let fileCategories: { value: FileCategory; label: string }[] = [
    { value: "Implementation", label: "Implementation" },
    { value: "Test", label: "Tests" },
    { value: "Documentation", label: "Documentation" },
    { value: "Generated", label: "Generated" },
    { value: "AgentGuidance", label: "Agent guidance" },
    { value: "Localization", label: "Localization" },
    { value: "Assets", label: "Assets" },
];

export function categoryOf(change: RevChange): FileCategory {
    return change.category ?? "Implementation";
}

export function categoryLabel(change: RevChange): string {
    return fileCategories.find(category => category.value === categoryOf(change))!.label;
}

export function groupFiles(changes: RevChange[]) {
    return fileCategories.map(category => ({ ...category, changes: changes.filter(change => categoryOf(change) === category.value) })).filter(group => group.changes.length);
}

export function lineCounts(changes: RevChange[]) {
    let counts = { added: 0, removed: 0, totalAdded: 0, totalRemoved: 0 };
    for (let change of changes) {
        let added = change.stat?.added ?? change.hunks.reduce((sum, hunk) => sum + hunk.lines.lines.filter(line => line.startsWith("+")).length, 0);
        let removed = change.stat?.removed ?? change.hunks.reduce((sum, hunk) => sum + hunk.lines.lines.filter(line => line.startsWith("-")).length, 0);
        counts.totalAdded += added;
        counts.totalRemoved += removed;
        if (categoryOf(change) === "Implementation") {
            counts.added += added;
            counts.removed += removed;
        }
    }
    return counts;
}
