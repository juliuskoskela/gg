import type { GithubPull } from "../../messages/GithubPull";
import type { RevHeader } from "../../messages/RevHeader";

export interface Configuration { owner: string; repo: string; reviewer: string; enabled: boolean; }
export interface CachedPull { pull: GithubPull; checkedAt: number; }
export interface Cache { scope: string; checkedAt: number; partial: boolean; entries: CachedPull[]; pages: { etag: string | null; pulls: GithubPull[]; hasNext: boolean }[]; }
export interface Mapping { scope: string; repositoryId: string; number: number; headSha: string; changes: { changeId: string; commitId: string }[]; }
export function scope(config: Configuration) { return `${config.owner.toLowerCase()}/${config.repo.toLowerCase()}`; }
export function validConfiguration(value: unknown): value is Configuration {
    if (!value || typeof value !== "object") return false;
    let config = value as Configuration;
    return [config.owner, config.repo].every(name => typeof name === "string" && name.length > 0 && name.length <= 100 && /^[a-z0-9_.-]+$/i.test(name) && name !== "." && name !== "..") && typeof config.reviewer === "string" && /^(?:[a-z0-9-]{1,100})?$/i.test(config.reviewer) && typeof config.enabled === "boolean";
}
export function emptyCache(config: Configuration): Cache { return { scope: scope(config), checkedAt: 0, partial: false, entries: [], pages: [] }; }
export function cacheValid(value: unknown, config: Configuration): value is Cache {
    if (!value || typeof value !== "object") return false;
    let cache = value as Cache;
    return cache.scope === scope(config) && Number.isFinite(cache.checkedAt) && typeof cache.partial === "boolean" && Array.isArray(cache.entries) && cache.entries.length <= 500 && cache.entries.every(entry => pullValid(entry.pull) && Number.isFinite(entry.checkedAt)) && Array.isArray(cache.pages) && cache.pages.length <= 3 && cache.pages.every(page => (page.etag === null || typeof page.etag === "string") && typeof page.hasNext === "boolean" && Array.isArray(page.pulls) && page.pulls.length <= 100 && page.pulls.every(pullValid));
}
function pullValid(pull: GithubPull) { return !!pull && Number.isInteger(pull.number) && pull.number > 0 && typeof pull.repository_id === "string" && /^[0-9]+$/.test(pull.repository_id) && typeof pull.title === "string" && typeof pull.author === "string" && ["open", "closed"].includes(pull.state) && /^[a-f0-9]{40}$/i.test(pull.head_sha) && /^[a-f0-9]{40}$/i.test(pull.base_sha) && Array.isArray(pull.requested_reviewers) && pull.requested_reviewers.every(name => typeof name === "string"); }
export function mappingValid(value: unknown): value is Mapping {
    if (!value || typeof value !== "object") return false;
    let mapping = value as Mapping;
    return typeof mapping.scope === "string" && typeof mapping.repositoryId === "string" && /^[0-9]+$/.test(mapping.repositoryId) && Number.isInteger(mapping.number) && mapping.number > 0 && /^[a-f0-9]{40}$/i.test(mapping.headSha) && Array.isArray(mapping.changes) && mapping.changes.length > 0 && mapping.changes.length <= 500 && mapping.changes.every(change => !!change && /^[a-z0-9]+$/i.test(change.changeId) && /^[a-f0-9]{40}$/i.test(change.commitId));
}
export function verify(mapping: Mapping, pull: GithubPull, current: (RevHeader | null)[]): "verified" | "rewritten" | "unavailable" | "remote-changed" {
    if (mapping.repositoryId !== pull.repository_id || mapping.headSha !== pull.head_sha) return "remote-changed";
    if (current.length !== mapping.changes.length || current.some(item => !item)) return "unavailable";
    if (current.some((item, index) => item!.id.change.hex !== mapping.changes[index].changeId || item!.id.commit.hex !== mapping.changes[index].commitId)) return "rewritten";
    return mapping.changes.some(change => change.commitId === pull.head_sha) ? "verified" : "unavailable";
}
export function retryTime(now: number, status: number, retry: number | null, reset: number | null) {
    let seconds = Math.max(60, Math.min(retry ?? 0, 86400));
    return Math.max(now + seconds * 1000, (status === 403 || status === 429) && reset ? Math.min(reset * 1000, now + 86400 * 1000) : 0);
}
