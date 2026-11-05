import type { RepoConfig } from "../messages/RepoConfig";

let scopes = new WeakMap<object, string>();

// reading state is session-local; reopening even the same path invalidates old operands.
export function repositoryScope(config: RepoConfig): string {
    if (config.type !== "Workspace") return "";
    let scope = scopes.get(config);
    if (!scope) {
        scope = `${config.absolute_path}:${crypto.randomUUID()}`;
        scopes.set(config, scope);
    }
    return scope;
}
