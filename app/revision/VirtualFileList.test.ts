import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevChange } from "../messages/RevChange";
import "../global.css";

describe("virtual file list sizing", () => {
    beforeEach(() => setupMocks());
    afterEach(async () => {
        document.documentElement.style.removeProperty("font-size");
        document.documentElement.style.removeProperty("--type-ui");
        await cleanupMocks();
    });

    it("keeps enlarged file rows separate and reveals the final file with End", async () => {
        let { default: VirtualFileList } = await import("./VirtualFileList.svelte");
        let changes: RevChange[] = Array.from({ length: 240 }, (_, i) => {
            let path = `folder/file-${String(i).padStart(3, "0")}.txt`;
            return { kind: "Modified", has_conflict: false, path: { repo_path: path, relative_path: path }, hunks: [] };
        });
        document.documentElement.style.fontSize = "16px";
        document.documentElement.style.setProperty("--type-ui", ".8125rem");
        let { container } = render(VirtualFileList, { props: { changes, headers: [], selectedPath: "", onSelect: () => {} } });
        container.style.cssText = "height: 300px; width: 390px; display: flex";
        let list = container.querySelector<HTMLElement>('[role="listbox"]')!;
        let minimum = matchMedia("(pointer: coarse), (max-width: 600px)").matches ? 44 : 24;
        let rows = () => [...container.querySelectorAll<HTMLElement>(".file-row")];
        await waitFor(() => expect(rows()[0].getBoundingClientRect().height).toBe(minimum));
        await waitFor(() => expect(rows().length).toBeLessThan(40));
        document.documentElement.style.fontSize = "32px";
        await waitFor(() => expect(rows()[0].getBoundingClientRect().height).toBeGreaterThan(minimum));
        let first = rows()[0].getBoundingClientRect();
        let second = rows()[1].getBoundingClientRect();
        expect(first.bottom).toBeLessThanOrEqual(second.top);
        let layout = rows()[0].querySelector<HTMLElement>(".layout")!;
        expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
        let button = rows()[0].querySelector<HTMLButtonElement>("button")!;
        button.focus();
        await fireEvent.keyDown(button, { key: "End" });
        await waitFor(() => expect(document.activeElement?.textContent).toContain("file-239.txt"));
        let last = document.activeElement!.getBoundingClientRect();
        let visible = list.getBoundingClientRect();
        expect(last.top).toBeGreaterThanOrEqual(visible.top);
        expect(last.bottom).toBeLessThanOrEqual(visible.bottom + 1);
    });
});
