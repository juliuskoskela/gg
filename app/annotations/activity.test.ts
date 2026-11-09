import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/svelte";
import type { AnnotationThread } from "../messages/AnnotationThread";
import { threadActivity } from "./activity";
import AgentDetails from "./AgentDetails.svelte";

afterEach(cleanup);

let thread: AnnotationThread = {
    id: "note", workspace: "default", created_at: "", updated_at: "", status: "open",
    targets: [{ subject: "", anchor: { kind: "revision", change_id: "abc", commit_id: "123" }, state: { type: "current" } }],
    posts: [{ id: "first", author: { name: "Reviewer", kind: "human" }, created_at: "", body: "Question" }],
};
describe("thread activity", () => {
    it("treats agent reply and rewrite as independent facts", () => {
        expect(threadActivity(thread)).toEqual({ agentReplied: false, rewritten: false });
        let replied: AnnotationThread = { ...thread, posts: [...thread.posts, { ...thread.posts[0], id: "reply", author: { name: "codex", kind: "agent" } }] };
        expect(threadActivity(replied)).toEqual({ agentReplied: true, rewritten: false });
        expect(threadActivity({ ...thread, posts: [...thread.posts, { ...thread.posts[0], id: "delegated", metadata: { onBehalfOf: { agent: "codex" } } }] }).agentReplied).toBe(true);
        let rewritten: AnnotationThread = { ...replied, targets: [{ ...thread.targets[0], state: { type: "rewritten", commit_id: "456", matches: true } }] };
        expect(threadActivity(rewritten)).toEqual({ agentReplied: true, rewritten: true });
        expect(threadActivity({ ...rewritten, posts: [...rewritten.posts, { ...thread.posts[0], id: "human-followup" }] })).toEqual({ agentReplied: false, rewritten: true });
    });
    it("shows model and the risk as reported metadata, never executable markup", () => {
        let view = render(AgentDetails, { props: { metadata: { onBehalfOf: { agent: "codex", model: "<script>model</script>" }, riskScore: { level: 3, explanations: ["Changes authentication"], sha: "a".repeat(40) } } } });
        expect(view.container.textContent).toContain("<script>model</script>");
        expect(view.container.querySelector("script")).toBeNull();
        expect(view.getByLabelText("Agent-reported high risk").getAttribute("title")).toContain("Changes authentication");
    });
});
