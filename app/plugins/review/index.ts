import { get } from "svelte/store";
import { targetsFor } from "../../annotations/anchors";
import type { BundledPlugin } from "../types";
import { controllers, createReviewController } from "./controller";

export let reviewPlugin: BundledPlugin = {
    manifest: {
        id: "review", name: "Review", description: "Review a stack of changes with shared notes and versioned verdicts.",
        version: "1", apiVersion: 1,
        capabilities: ["queries.read", "annotations.read", "reviews.read", "storage", "navigation", "annotations.write", "annotations.exchange"],
    },
    async activate(api) {
        let { default: ReviewView } = await import("./ReviewView.svelte");
        let controller = createReviewController(api);
        controllers.set(api, controller);
        void controller.refresh();
        return {
            commands: [{
                id: "note", label: "Add note to current review", icon: "message-square", contextMenu: true,
                available(operand) {
                    let state = get(controller.state), session = state.sessions.find(session => session.id === state.selected), targets = targetsFor(operand);
                    return !!session && targets.length > 0 && targets.every(target => session.members.some(member => member.changeId === target.anchor.change_id));
                },
                async execute(operand) {
                    controller.compose(targetsFor(operand));
                    await api.navigation.openView("sessions");
                },
            }, {
                id: "start", label: "Start review of selected changes", icon: "check-square", contextMenu: true,
                available: operand => operand?.type === "Revision" || operand?.type === "Revisions",
                async execute(operand) {
                    if (operand?.type !== "Revision" && operand?.type !== "Revisions") return;
                    controller.stageReview(operand.type === "Revision" ? [operand.header] : operand.headers);
                    await api.navigation.openView("sessions");
                },
            }],
            views: [{ id: "sessions", label: "Reviews", component: ReviewView }],
            dispose() { controller.dispose(); controllers.delete(api); },
        };
    },
};
