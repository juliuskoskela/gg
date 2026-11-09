import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext, destroyContext, extractTestRepo, startGG, type TestContext } from "./harness";
import type { PluginNoteAction } from "../app/messages/PluginNoteAction";
import type { PluginNotesResponse } from "../app/messages/PluginNotesResponse";

describe("plugin annotation exchange", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        url = await startGG(ctx);
        await fetch(`${url}/api/query/query_workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ctx.tempDir }) });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });
    async function notes(action: PluginNoteAction, context = "session-one") {
        return fetch(`${url}/api/annotate/plugin_notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { plugin: "review", context, workspace: ctx.tempDir, action } }) });
    }
    it("shares core threads, protects contexts and restores an offline bundle without changing authors", async () => {
        let created = await (await notes({ type: "Create", targets: [{ anchor: { kind: "revision", change_id: "abc", commit_id: "def" }, subject: "offline change" }], body: "Question" })).json() as PluginNotesResponse;
        if (created.type !== "List") throw new Error("expected notes");
        let thread = created.value.threads[0];
        expect(thread.contexts).toEqual([{ plugin: "review", id: "session-one" }]);
        expect((await notes({ type: "Reply", id: thread.id, body: "wrong context" }, "other-session")).ok).toBe(false);
        expect((await notes({ type: "Reply", id: thread.id, body: "Answer" })).ok).toBe(true);
        let exported = await (await notes({ type: "Export" })).json() as PluginNotesResponse;
        if (exported.type !== "Bundle") throw new Error("expected bundle");
        expect(exported.value.threads[0].events).toHaveLength(2);
        let core = await fetch(`${url}/api/annotate/annotations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { type: "List" } }) }).then(response => response.json());
        expect(core.threads[0].id).toBe(thread.id);
        await fetch(`${url}/api/annotate/annotations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { type: "Delete", ids: [thread.id] } }) });
        let restored = await (await notes({ type: "Import", bundle: exported.value })).json() as PluginNotesResponse;
        if (restored.type !== "List") throw new Error("expected restored notes");
        expect(restored.value.threads[0].id).toBe(thread.id);
        expect(restored.value.threads[0].posts.map(post => ({ id: post.id, author: post.author, body: post.body }))).toEqual(exported.value.threads[0].events.map(event => ({ id: event.id, author: event.author, body: event.type === "post" ? event.body : "" })));
        expect((await notes({ type: "Import", bundle: exported.value }, "other-session")).ok).toBe(false);
    });
});
