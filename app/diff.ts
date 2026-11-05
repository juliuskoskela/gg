import type { RevChange } from "./messages/RevChange";

// filenames are assigned after parsing so unusual repository paths cannot become patch metadata.
export function changePatch(change: RevChange): string {
    let oldName = change.kind === "Added" ? "/dev/null" : "a/file";
    let newName = change.kind === "Deleted" ? "/dev/null" : "b/file";
    let mode = change.kind === "Added" ? "new file mode 100644\n" : change.kind === "Deleted" ? "deleted file mode 100644\n" : "";
    return `diff --git a/file b/file\n${mode}--- ${oldName}\n+++ ${newName}\n` + change.hunks.map(hunk => {
        let { from_file: from, to_file: to } = hunk.location;
        return `@@ -${from.len ? from.start : Math.max(0, from.start - 1)},${from.len} +${to.len ? to.start : Math.max(0, to.start - 1)},${to.len} @@\n` + hunk.lines.lines.map(line => line.endsWith("\n") ? line : `${line}\n\\ No newline at end of file\n`).join("");
    }).join("");
}
