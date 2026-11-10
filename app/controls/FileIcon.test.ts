import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import "../global.css";
import { cleanupMocks, setupMocks } from "../mocks";
import { fileIconName, fileIconUrl } from "./fileIcons";
import type { RevChange } from "../messages/RevChange";

describe("Material file icons", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => cleanupMocks());
    it.each([
        ["app/View.svelte", "svelte"], ["SRC/MAIN.RS", "rust"], ["C:\\repo\\View.TSX", "react_ts"],
        ["package.json", "nodejs"], ["nested/package-lock.json", "lock"], ["pnpm-lock.yaml", "lock"], ["Cargo.lock", "lock"],
        [".gitignore", "git"], [".editorconfig", "settings"], ["vite.config.ts", "settings"], ["tsconfig.build.json", "settings"],
        ["Dockerfile.prod", "docker"], ["README.MD", "markdown"], ["photo.avif", "image"], ["run.sh", "console"],
        ["config.toml", "toml"], ["notes.unknown", "document"], ["no-extension", "document"], ["", "document"],
    ])("maps %s to %s with a bundled asset", (path, icon) => {
        expect(fileIconName(path)).toBe(icon);
        expect(fileIconUrl(path)).toBeTruthy();
    });
    it("updates a reused file row while retaining independent change status", async () => {
        let { default: ChangeObject } = await import("../objects/ChangeObject.svelte");
        let change: RevChange = { kind: "Added", path: { repo_path: "View.svelte", relative_path: "View.svelte" }, has_conflict: false, hunks: [] };
        let { container, rerender, getByRole } = render(ChangeObject, { props: { change, headers: null, selected: false, tree: true } });
        let icon = container.querySelector("img")!;
        let firstSource = icon.getAttribute("src");
        expect(icon.getAttribute("data-file-icon")).toBe("svelte");
        expect(getByRole("img", { name: "Added" })).toBeTruthy();
        await rerender({ change: { ...change, kind: "Deleted", path: { repo_path: "main.rs", relative_path: "main.rs" } }, headers: null, selected: false, tree: true });
        expect(container.querySelector("img")).toBe(icon);
        expect(icon.getAttribute("data-file-icon")).toBe("rust");
        expect(icon.getAttribute("src")).not.toBe(firstSource);
        expect(getByRole("img", { name: "Deleted" })).toBeTruthy();
        expect(icon.getAttribute("alt")).toBe("");
        await rerender({ change: { ...change, has_conflict: true }, headers: null, selected: false, tree: true });
        expect(getByRole("img", { name: "Unresolved conflict" })).toBeTruthy();
    });
    it("refreshes icons when virtual file slots are recycled", async () => {
        let { default: FileTreeView } = await import("../tree/FileTreeView.svelte");
        let changes: RevChange[] = Array.from({ length: 240 }, (_, i) => {
            let path = i === 239 ? "last.rs" : `file-${i}.svelte`;
            return { kind: "Modified", has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [] };
        });
        let { container } = render(FileTreeView, { props: { changes, label: "Files", memoryKey: "icons", seedKey: "icons" } });
        container.style.cssText = "height:250px;width:390px;display:flex";
        await waitFor(() => expect(container.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(1));
        let first = container.querySelector<HTMLElement>('[role="treeitem"]')!;
        expect(first.querySelector("img")?.getAttribute("data-file-icon")).toBe("svelte");
        first.focus();
        await fireEvent.keyDown(first, { key: "End" });
        await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("last.rs"));
        expect(document.activeElement?.querySelector("img")?.getAttribute("data-file-icon")).toBe("rust");
    });
});
