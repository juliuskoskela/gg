import type { AddWorkspace } from "../messages/AddWorkspace";
import type { ForgetWorkspace } from "../messages/ForgetWorkspace";
import type { OpenWorkspace } from "../messages/OpenWorkspace";
import type { RenameWorkspace } from "../messages/RenameWorkspace";
import { getInput, mutate } from "../ipc";

export function siblingWorkspacePrefix(workspacePath: string, projectName?: string): string {
    let sep = workspacePath.includes("\\") ? "\\" : "/";
    let trimmed = workspacePath.replace(/[\\/]+$/, "");
    let splitAt = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    if (splitAt <= 0) return "";
    let parent = trimmed.slice(0, splitAt);
    let base = projectName || trimmed.slice(splitAt + 1);
    return base ? `${parent}${sep}${base}-` : "";
}

export default class WorkspaceMutator {
    #name: string;
    #valid: () => boolean;

    constructor(name: string, valid: () => boolean = () => true) {
        this.#valid = valid;
        this.#name = name;
    }

    static async add(defaultSiblingPrefix = "", valid: () => boolean = () => true) {
        let detail = defaultSiblingPrefix
            ? `Leave Destination blank to create ${defaultSiblingPrefix}<name>.`
            : "Specify a workspace name and/or destination directory.";
        let response = await getInput("New Workspace", detail, [
            { label: "Workspace Name", choices: [] },
            { label: "Destination", choices: [] },
            { label: "Open Workspace", choices: ["true", "false"] },
        ]);
        if (!response || !valid()) return;
        let name = response["Workspace Name"].trim();
        let path = response["Destination"].trim();
        let openAfter = response["Open Workspace"] === "true";
        if (!name && path) {
            name = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
        }
        let created = await mutate<AddWorkspace>("add_workspace", { name, path }, { operation: "Creating workspace…" });
        if (created && openAfter && name) {
            await mutate<OpenWorkspace>("open_workspace", { name });
        }
    }

    handle(event: string | undefined) {
        if (!event) {
            return;
        }

        switch (event) {
            case "add":
                void WorkspaceMutator.add("", this.#valid);
                break;

            case "open":
                this.onOpen();
                break;

            case "forget":
                this.onForget();
                break;

            case "rename":
                this.onRename();
                break;

            default:
                console.log(`unimplemented mutation '${event}'`, this);
        }
    }

    onOpen = () => {
        mutate<OpenWorkspace>("open_workspace", {
            name: this.#name,
        });
    };

    onForget = () => {
        mutate<ForgetWorkspace>("forget_workspace", {
            name: this.#name,
        });
    };

    onRename = async () => {
        let response = await getInput("Rename Workspace", "", ["Workspace Name"]);
        if (response && this.#valid()) {
            let new_name = response["Workspace Name"];
            mutate<RenameWorkspace>("rename_workspace", {
                name: this.#name,
                new_name,
            });
        }
    };
}
