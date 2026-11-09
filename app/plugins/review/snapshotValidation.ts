import type { RevChange } from "../../messages/RevChange";

export function requireValue(value: unknown, message = "Invalid review snapshot"): asserts value { if (!value) throw new Error(message); }
export function object(value: unknown): Record<string, unknown> { requireValue(value !== null && typeof value === "object" && !Array.isArray(value)); return value as Record<string, unknown>; }
export function text(value: unknown, max = 100_000, nonempty = false): asserts value is string { requireValue(typeof value === "string" && value.length <= max && (!nonempty || value.trim().length > 0)); }
export function array(value: unknown, max = 10_000): unknown[] { requireValue(Array.isArray(value) && value.length <= max); return value; }
export function integer(value: unknown, min = 0): asserts value is number { requireValue(Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= 100_000_000); }
export function time(value: unknown) { text(value, 80, true); requireValue(Number.isFinite(Date.parse(value))); }
export function unique(items: unknown[], field = "id") { let ids = items.map(value => object(value)[field]); requireValue(new Set(ids).size === ids.length, "Duplicate identifiers in review snapshot"); }
export function person(value: unknown, legacy = false) { let item = object(value); text(item.name, 1000, true); text(legacy ? item.id : item.email, 1000); }
export function revisionId(value: unknown) {
    let id = object(value);
    for (let name of ["change", "commit"]) { let part = object(id[name]); requireValue(part.type === (name === "change" ? "ChangeId" : "CommitId")); text(part.hex, 256, true); text(part.prefix, 256); text(part.rest, 256); }
}
export function change(value: unknown): asserts value is RevChange {
    let item = object(value), path = object(item.path);
    requireValue(["None", "Added", "Deleted", "Modified"].includes(String(item.kind)) && typeof item.has_conflict === "boolean");
    text(path.repo_path, 4096, true); text(path.relative_path, 4096, true);
    if (item.stat !== undefined) { let stat = object(item.stat); integer(stat.added); integer(stat.removed); }
    for (let raw of array(item.hunks)) {
        let hunk = object(raw), location = object(hunk.location), before = object(location.from_file), after = object(location.to_file);
        integer(before.start); integer(before.len); integer(after.start); integer(after.len);
        let oldCount = 0, newCount = 0;
        for (let line of array(object(hunk.lines).lines, 200_000)) {
            text(line, 32 * 1024 * 1024); requireValue(/^[ +\-\\]/.test(line));
            if (line[0] === " " || line[0] === "-") oldCount++;
            if (line[0] === " " || line[0] === "+") newCount++;
        }
        requireValue(oldCount === before.len && newCount === after.len, "Captured patch line counts do not match its ranges");
    }
}
export function bounded(value: unknown) {
    let pending = [{ value, depth: 0 }], count = 0;
    while (pending.length) {
        let current = pending.pop()!;
        requireValue(++count <= 500_000 && current.depth <= 40, "Review snapshot is too complex");
        if (current.value && typeof current.value === "object") {
            for (let child of Object.values(current.value)) pending.push({ value: child, depth: current.depth + 1 });
        }
    }
}
export function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}
