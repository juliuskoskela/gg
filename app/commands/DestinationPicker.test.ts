import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import { cleanupMocks, setupMocks } from "../mocks";
import type { RevHeader } from "../messages/RevHeader";

let header: RevHeader = {
    id: { change: { type: "ChangeId", hex: "abcdefghijk", prefix: "a", rest: "bcdefghijk", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "0123456789abcdef", prefix: "0", rest: "123456789abcdef" } },
    description: { lines: ["Fix parser"] }, author: { name: "Test", email: "test@example.com", timestamp: "" }, refs: [], parent_ids: [], has_conflict: false, is_immutable: false, is_working_copy: false, working_copy_of: null,
};

describe("destination picker", () => {
    afterEach(async () => cleanupMocks());
    it("filters visible revision candidates and selects one by commit", async () => {
        setupMocks();
        let { default: Picker } = await import("./DestinationPicker.svelte");
        let { chooseDestination } = await import("./destination");
        let { findByRole, getByLabelText } = render(Picker);
        let choice = chooseDestination("Choose destination", [header]);
        let field = await findByRole("textbox", { name: "Bookmark or revset" });
        await fireEvent.input(field, { target: { value: "parser" } });
        await fireEvent.click(await findByRole("button", { name: /Fix parser/ }));
        expect(await choice).toBe(header.id.commit.hex);
    });
    it("returns no destination on cancel", async () => {
        setupMocks();
        let { default: Picker } = await import("./DestinationPicker.svelte");
        let { chooseDestination } = await import("./destination");
        let { findByRole } = render(Picker);
        let choice = chooseDestination("Choose destination", []);
        await fireEvent.click(await findByRole("button", { name: "Cancel" }));
        expect(await choice).toBeNull();
    });
});
