import { getInput, mutate, trigger } from "../ipc";
import type { CloneRepository } from "../messages/CloneRepository";
import type { RepoEvent } from "../messages/RepoEvent";

// initializing has no form of its own: a chosen folder opens, and the start page asks before initializing it
export default class RepositoryMutator {
    async handle(event: RepoEvent) {
        switch (event.type) {
            case "CloneURL":
                await this.#handleUrl();
                break;

            case "CloneConfirm":
                await this.#handleClone(event.url, event.path);
                break;
        }
    }

    async #handleUrl() {
        let fields = [
            { label: "Repository URL", choices: [] }
        ];

        let result = await getInput("Clone repository", "Next, choose the folder to clone into.", fields, "Choose destination…");
        if (!result) return;

        let url = result["Repository URL"].trim();
        if (!url) return;

        trigger("forward_clone_url", { url });
    }

    async #handleClone(originalUrl: string, originalPath: string) {
        // jj colocates new repositories by default, so Git tools keep working in the clone
        let fields = [
            { label: "Repository URL", choices: [originalUrl] },
            { label: "Destination", choices: [originalPath] },
            { label: "Colocate with Git", choices: ["true", "false"] },
        ];

        let result = await getInput("Clone repository", "", fields, "Clone");
        if (!result) return;

        let url = result["Repository URL"].trim();
        let path = result["Destination"].trim();
        let colocated = result["Colocate with Git"] === "true";

        mutate<CloneRepository>("clone_repository", {
            url,
            path,
            colocated,
        }, { operation: "Cloning…" });
    }
}
