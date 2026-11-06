import { mount, unmount } from "svelte";
import DiffViewer from "../../app/DiffViewer.svelte";
import "../../app/global.css";
import { diffStyle } from "../../app/stores";
import type { RevChange } from "../../app/messages/RevChange";

let params = new URLSearchParams(location.search);
let before = Array.from({ length: 180 }, (_, i) => `let context${i + 1} = ${i + 1};\n`);
let after = [...before];
after[30] = "let changed31 = true;\n";
after[140] = "let changed141 = true;\n";
let hunks = [28, 138].map(start => ({
    location: { from_file: { start: start + 1, len: 5 }, to_file: { start: start + 1, len: 5 } },
    lines: { lines: before.slice(start, start + 5).flatMap((line, i) => i === 2 ? [`-${line}`, `+${after[start + i]}`] : [` ${line}`]) },
}));
let change: RevChange = { kind: "Modified", has_conflict: false, path: { repo_path: "fixture.ts", relative_path: "fixture.ts" }, hunks };
let theme = params.get("theme") === "light" ? "light" : "dark";
diffStyle.set(params.get("style") === "split" ? "split" : "unified");
document.documentElement.style.colorScheme = theme;
let shell = document.querySelector<HTMLElement>("#shell")!;
shell.style.cssText = `color-scheme:${theme};padding:20px;background:var(--surface);color:var(--text)`;
let toolbar = document.createElement("button");
toolbar.textContent = "Show all context";
shell.append(toolbar);
let reader = document.createElement("div");
reader.id = "reader";
reader.style.cssText = "height:240px;overflow:auto;border:1px solid var(--border);margin-top:60px";
shell.append(reader);
let loads = 0;
let component = mount(DiffViewer, { target: reader, props: { change, themeOverride: theme, loadFullFiles: async () => {
    document.body.dataset.loads = String(++loads);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { before: before.join(""), after: after.join("") };
} } });
Object.defineProperty(window, "diffFixtureHunks", { get: () => JSON.stringify(change.hunks) });
toolbar.onclick = async () => {
    await unmount(component);
    let complete: RevChange = { ...change, hunks: [{
        location: { from_file: { start: 1, len: 180 }, to_file: { start: 1, len: 180 } },
        lines: { lines: before.flatMap((line, i) => line === after[i] ? [` ${line}`] : [`-${line}`, `+${after[i]}`]) },
    }] };
    component = mount(DiffViewer, { target: reader, props: { change: complete, themeOverride: theme, fullContext: true } });
};
