import type { AnnotationPost } from "../messages/AnnotationPost";
import type { AnnotationThread } from "../messages/AnnotationThread";

export function isAgentPost(post: AnnotationPost | undefined) {
    return post?.author.kind === "agent" || !!post?.metadata?.onBehalfOf;
}

export function threadActivity(thread: AnnotationThread) {
    return {
        agentReplied: thread.posts.length > 1 && isAgentPost(thread.posts.at(-1)),
        rewritten: thread.targets.some(target => target.state.type === "rewritten"),
    };
}
