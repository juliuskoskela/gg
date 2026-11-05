import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { setupMocks, cleanupMocks } from "./mocks";
import type { RevChange } from "./messages/RevChange";

describe("syntax diff viewer", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());
    it("highlights code in split and stacked modes without interpreting file contents as HTML", async () => {
        let { default: DiffViewer } = await import("./DiffViewer.svelte");
        let { diffStyle, diffWrap } = await import("./stores");
        diffStyle.set("split");
        let change: RevChange = { kind: "Modified", has_conflict: false, path: { repo_path: "src/test.ts", relative_path: "src/test.ts" }, hunks: [{ location: { from_file: { start: 1, len: 1 }, to_file: { start: 1, len: 1 } }, lines: { lines: ["-let value = 1;\n", "+let value = '<img src=x onerror=alert(1)>';\n"] } }] };
        let { container } = render(DiffViewer, { props: { change } });
        let root = () => container.querySelector("diffs-container")?.shadowRoot;
        await waitFor(() => expect(root()?.querySelector("pre")?.getAttribute("data-diff-type")).toBe("split"));
        await waitFor(() => expect(root()?.querySelectorAll("[data-line] span[style]").length).toBeGreaterThan(1));
        expect(root()?.querySelector("img")).toBeNull();
        expect(root()?.textContent).toContain("<img src=x");
        diffStyle.set("unified");
        diffWrap.set(true);
        await waitFor(() => expect(root()?.querySelector("pre")?.getAttribute("data-diff-type")).toBe("single"));
        diffStyle.set("split");
        diffWrap.set(false);
    });
    it("renders conflict markers as file content without patch prefixes", async () => {
        let { default: DiffViewer } = await import("./DiffViewer.svelte");
        let change: RevChange = { kind: "None", has_conflict: true, path: { repo_path: "a.ts", relative_path: "a.ts" }, hunks: [{ location: { from_file: { start: 1, len: 5 }, to_file: { start: 1, len: 0 } }, lines: { lines: ["-<<<<<<< current\n", "-let value = 1;\n", "-=======\n", "-let value = 2;\n", "->>>>>>> incoming\n"] } }] };
        let { container } = render(DiffViewer, { props: { change } });
        await waitFor(() => expect(container.querySelector("diffs-container")?.shadowRoot?.querySelector("pre")?.textContent).toContain("<<<<<<< current"));
        let content = container.querySelector("diffs-container")?.shadowRoot?.querySelector("pre")?.textContent;
        expect(content).not.toContain("-<<<<<<<");
        expect(content).toContain("let value = 2;");
    });

    it("keeps horizontal scrolling reachable in long split and unified diffs", async () => {
        let { default: DiffViewer } = await import("./DiffViewer.svelte");
        let { diffStyle, diffWrap } = await import("./stores");
        diffStyle.set("split");
        diffWrap.set(false);
        let lines = Array.from({ length: 80 }, (_, i) => `let line${i} = '${"long content ".repeat(30)}';\n`);
        let change: RevChange = { kind: "Modified", has_conflict: false, path: { repo_path: "long.ts", relative_path: "long.ts" }, hunks: [{ location: { from_file: { start: 1, len: 80 }, to_file: { start: 1, len: 80 } }, lines: { lines: [...lines.map(line => `-${line}`), ...lines.map(line => `+${line}`)] } }] };
        let { container } = render(DiffViewer, { props: { change } });
        container.style.cssText = "width:600px;height:240px;overflow:auto";
        let tracks = () => Array.from(container.querySelectorAll<HTMLElement>(".horizontal-track"));
        let code = () => Array.from(container.querySelector("diffs-container")!.shadowRoot!.querySelectorAll<HTMLElement>("[data-code]:not([data-diffs-scrollbar-measure])"));
        await waitFor(() => expect(tracks().length).toBe(2));
        await waitFor(() => expect(tracks()[0].scrollWidth).toBeGreaterThan(tracks()[0].clientWidth));
        expect(tracks()[0].getBoundingClientRect().bottom).toBeLessThanOrEqual(container.getBoundingClientRect().bottom);
        expect(code()[0].getBoundingClientRect().height).toBeGreaterThan(240);
        tracks()[0].scrollLeft = 200;
        await waitFor(() => expect(code()[0].scrollLeft).toBe(200));
        code()[0].scrollLeft = 400;
        await waitFor(() => expect(tracks()[0].scrollLeft).toBe(400));
        diffStyle.set("unified");
        await waitFor(() => expect(tracks().length).toBe(1));
        await waitFor(() => expect(tracks()[0].scrollWidth).toBeGreaterThan(tracks()[0].clientWidth));
        tracks()[0].scrollLeft = 250;
        await waitFor(() => expect(code()[0].scrollLeft).toBe(250));
        diffWrap.set(true);
        await waitFor(() => expect(container.querySelector(".diff-scrollbars")?.hasAttribute("hidden")).toBe(true));
        diffStyle.set("auto");
        diffWrap.set(false);
    });

    it("renders complete context with change highlighting without requesting patch hydration", async () => {
        let { default: DiffViewer } = await import("./DiffViewer.svelte");
        let change: RevChange = { kind: "Modified", has_conflict: false, path: { repo_path: "file.txt", relative_path: "file.txt" }, hunks: [{ location: { from_file: { start: 1, len: 40 }, to_file: { start: 1, len: 40 } }, lines: { lines: Array.from({ length: 40 }, (_, i) => i === 20 ? ["-old middle\n", "+new middle\n"] : [` context ${i}\n`]).flat() } }] };
        let { container } = render(DiffViewer, { props: { change, fullContext: true } });
        let root = () => container.querySelector("diffs-container")?.shadowRoot;
        await waitFor(() => expect(root()?.textContent).toContain("context 39"));
        expect(root()?.textContent).toContain("context 0");
        expect(root()?.textContent).toContain("new middle");
        expect(root()?.querySelector('[data-line-type="change-addition"]')).not.toBeNull();
        expect(container.textContent).not.toContain("Couldn’t render");
    });

});
