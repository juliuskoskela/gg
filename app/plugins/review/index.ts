import type { BundledPlugin } from "../types";
import { controllers, createReviewController } from "./controller";
import ReviewView from "./ReviewView.svelte";

export let reviewPlugin: BundledPlugin = {
    manifest: {
        id: "review", name: "Review", description: "Review a stack of changes with shared notes and versioned verdicts.",
        version: "1", apiVersion: 1,
        capabilities: ["queries.read", "annotations.read", "reviews.read", "storage"],
    },
    activate(api) {
        let controller = createReviewController(api);
        controllers.set(api, controller);
        void controller.refresh();
        return {
            views: [{ id: "sessions", label: "Reviews", component: ReviewView }],
            dispose() { controller.dispose(); controllers.delete(api); },
        };
    },
};
