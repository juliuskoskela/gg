import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupMocks, setupMocks } from "../mocks";
import { currentWorkspaceIdentity } from "./context";
import { contextCommands } from "./registry";
import { currentMutation } from "../stores";
import { operationState } from "../operations";

describe("workspace command eligibility", () => {
    beforeEach(() => { setupMocks(); currentMutation.set(null); operationState.set(null); });
    afterEach(async () => { currentWorkspaceIdentity.set({ type: "checking" }); await cleanupMocks(); });
    function reason(name: string, command: string) { return contextCommands({ type: "Workspace", name }).find(item => item.id === `context-${command}`)?.reason; }
    it("waits for authoritative identity before allowing rename or forget", () => {
        currentWorkspaceIdentity.set({ type: "checking" });
        expect(reason("default", "rename")).toBe("Checking current workspace");
        expect(reason("default", "forget")).toBe("Checking current workspace");
        expect(reason("default", "open")).toBeNull();
        currentWorkspaceIdentity.set({ type: "unavailable" });
        expect(reason("default", "rename")).toBe("Cannot determine current workspace");
    });
    it("permits only the backend-supported current and other workspace actions", () => {
        currentWorkspaceIdentity.set({ type: "known", name: "primary" });
        expect(reason("primary", "rename")).toBeNull();
        expect(reason("primary", "forget")).toBe("Cannot forget the current workspace");
        expect(reason("other", "rename")).toBe("Only the current workspace can be renamed");
        expect(reason("other", "forget")).toBeNull();
    });
});
