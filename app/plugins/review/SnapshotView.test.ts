import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { userEvent } from "vitest/browser";
import { setupMocks, cleanupMocks } from "../../mocks";
import { legacyFixture, snapshotFixture } from "./snapshot.fixture";
import SnapshotView from "./SnapshotView.svelte";
let query = vi.fn(() => { throw Error("offline viewer queried the repository"); });
beforeEach(() => { query.mockClear(); setupMocks(query); });
afterEach(cleanupMocks);
describe("offline review snapshot", () => {
    it("renders stored files and legacy notes without any repository query", async () => {
        let view = render(SnapshotView, { snapshot: legacyFixture() });
        expect(view.getByText("Legacy portable review")).toBeTruthy();
        await userEvent.click(view.getByText("file.txt:1"));
        await waitFor(() => expect(view.getByText("Legacy note")).toBeTruthy());
        expect(view.getByRole("combobox", { name: "Captured file" })).toBeTruthy();
        await waitFor(() => expect(view.container.querySelector("diffs-container")?.shadowRoot?.textContent).toContain("new"));
        expect(query).not.toHaveBeenCalled();
    });
    it("keeps old marks from approving a newer captured version and can show missing members", async () => {
        let snapshot = snapshotFixture(), captured = snapshot.members[0];
        captured.member = { ...captured.member, commitId: "456" };
        snapshot.members.push({ member: { changeId: "def", commitId: "789", description: "Removed change" }, state: "unavailable", reason: "The commit is unavailable" });
        let view = render(SnapshotView, { snapshot });
        expect(view.getByText("0 / 1 files")).toBeTruthy();
        await fireEvent.click(view.getByRole("button", { name: "Next" }));
        expect(view.getByText("The commit is unavailable")).toBeTruthy();
        expect(query).not.toHaveBeenCalled();
    });
});
