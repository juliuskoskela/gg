import type { BundledPlugin } from "../types";
import { controllers, createGithubController } from "./controller";
export let githubPlugin: BundledPlugin = {
    manifest: { id: "github", name: "Public GitHub", version: "1", apiVersion: 1, description: "Cache public pull requests and map their exact heads to local changes. Read only; configuration and public-network opt-in required.", capabilities: ["github.read", "queries.read", "navigation", "storage", "facts.publish"] },
    async activate(api) {
        let { default: GithubView } = await import("./GithubView.svelte");
        let controller = createGithubController(api); controllers.set(api, controller); void controller.load();
        return { views: [{ id: "pulls", label: "Public GitHub", component: GithubView }], dispose() { controller.dispose(); controllers.delete(api); } };
    },
};
