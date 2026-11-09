import { get, writable } from "svelte/store";
import type { PluginAPI } from "../types";
import type { GithubResponse } from "../../messages/GithubResponse";
import type { GithubPull } from "../../messages/GithubPull";
import type { RevisionSummaryResult } from "../../messages/RevisionSummaryResult";
import type { RevId } from "../../messages/RevId";
import type { RevHeader } from "../../messages/RevHeader";
import { cacheValid, emptyCache, mappingValid, retryTime, scope, validConfiguration, verify, type Cache, type Configuration, type Mapping } from "./model";

let interval = 15 * 60 * 1000;
export function createGithubController(api: PluginAPI) {
    let state = writable({ config: null as Configuration | null, cache: null as Cache | null, mappings: [] as Mapping[], current: new Map<string, RevHeader | null>(), busy: false, error: "", retryAt: 0, ready: false });
    let alive = true, epoch = 0, lastAttempt = 0, detailOffset = 0, resolution = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = api.context.subscribe(() => { if (get(state).ready) void resolveMappings().catch(error => { if (alive) state.update(value => ({ ...value, error: String(error) })); }); });
    function check(version: number) { if (!alive || version !== epoch) throw new Error("GitHub view changed while loading"); }
    function schedule(delay = interval) { if (timer) clearTimeout(timer); if (alive && get(state).config?.enabled) timer = setTimeout(() => void refresh(), delay); }
    async function resolveMappings() {
        let version = epoch, run = ++resolution, current = new Map<string, RevHeader | null>();
        for (let mapping of get(state).mappings.filter(mapping => mapping.scope === (get(state).config && scope(get(state).config!)))) for (let change of mapping.changes) {
            let id: RevId = { change: { type: "ChangeId", hex: change.changeId, prefix: change.changeId, rest: "", offset: null, is_divergent: false }, commit: { type: "CommitId", hex: "", prefix: "", rest: "" } };
            let result = await api.query<RevisionSummaryResult>("query_revision_summary", { set: { from: id, to: id } });
            check(version);
            current.set(change.changeId, result.type === "data" && result.value.type === "Detail" && result.value.headers.length === 1 ? result.value.headers[0] : null);
        }
        if (alive && run === resolution) state.update(value => ({ ...value, current }));
    }
    async function load() {
        let version = epoch;
        try {
            let [config, cache, mappings, cooldown] = await Promise.all([api.storage.get("configuration"), api.storage.get("cache"), api.storage.get("mappings"), api.storage.get("retry-at")]);
            check(version);
            let configured = validConfiguration(config) ? config : null;
            state.update(value => ({ ...value, config: configured, cache: configured && cacheValid(cache, configured) ? cache : null, mappings: Array.isArray(mappings) ? mappings.filter(mappingValid).slice(0, 100) : [], retryAt: typeof cooldown === "number" && Number.isFinite(cooldown) ? Math.min(cooldown, Date.now() + 86400000) : 0, ready: true }));
            await resolveMappings();
            if (configured?.enabled) schedule(0);
        } catch (error) { if (alive) state.update(value => ({ ...value, error: String(error), ready: true })); }
    }
    async function configure(config: Configuration) {
        if (!validConfiguration(config)) throw new Error("Enter a public GitHub owner/repository and optional reviewer login");
        await api.storage.set("configuration", config);
        if (!alive) return;
        epoch++;
        let previous = get(state);
        state.set({ ...previous, busy: false, config, cache: previous.cache?.scope === scope(config) ? previous.cache : null, error: "" });
        await resolveMappings();
        if (timer) clearTimeout(timer);
        if (config.enabled) schedule(0);
    }
    async function read(config: Configuration, endpoint: { type: "List"; page: number } | { type: "Pull"; number: number }, etag: string | null, version: number) {
        let response = await api.github.read({ owner: config.owner, repo: config.repo, endpoint, etag });
        check(version);
        if (response.status !== 200 && response.status !== 304) {
            let retryAt = retryTime(Date.now(), response.status, response.retry_after_seconds, response.reset_at_seconds);
            await api.storage.set("retry-at", retryAt); check(version);
            state.update(value => ({ ...value, retryAt }));
            throw new Error(`Public GitHub read returned ${response.status}. Cached data is retained; retry after ${new Date(retryAt).toLocaleTimeString()}.`);
        }
        if (response.remaining === 0) {
            let retryAt = retryTime(Date.now(), 403, response.retry_after_seconds, response.reset_at_seconds);
            await api.storage.set("retry-at", retryAt); check(version); state.update(value => ({ ...value, retryAt }));
        }
        return response;
    }
    async function refresh() {
        let previous = get(state), config = previous.config;
        if (!alive || !config?.enabled || previous.busy) return;
        let now = Date.now();
        if (now < Math.max(previous.retryAt, lastAttempt + 60_000)) { schedule(Math.max(previous.retryAt, lastAttempt + 60_000) - now); return; }
        lastAttempt = now;
        state.update(value => ({ ...value, busy: true, error: "" }));
        let version = epoch;
        try {
            let old = previous.cache ?? emptyCache(config), pages: Cache["pages"] = [], pulls: GithubPull[] = [];
            for (let page = 1; page <= 3; page++) {
                if (Date.now() < get(state).retryAt) throw new Error("GitHub rate limit reached; cached data is retained");
                let response = await read(config, { type: "List", page }, old.pages[page - 1]?.etag ?? null, version);
                let saved = response.status === 304 ? old.pages[page - 1] : { etag: response.etag, pulls: response.pulls, hasNext: response.has_next };
                if (!saved) throw new Error("GitHub returned an unchanged page without a local cache");
                pages.push(saved); pulls.push(...saved.pulls);
                if (!saved.hasNext) break;
            }
            let entries = new Map(old.entries.map(entry => [entry.pull.number, entry]));
            for (let pull of pulls) entries.set(pull.number, { pull, checkedAt: now });
            let mappings = previous.mappings.filter(mapping => mapping.scope === scope(config));
            let unseen = mappings.filter(mapping => !pulls.some(pull => pull.number === mapping.number));
            for (let index = 0; index < Math.min(2, unseen.length); index++) {
                if (Date.now() < get(state).retryAt) break;
                let mapping = unseen[(detailOffset + index) % unseen.length];
                let response = await read(config, { type: "Pull", number: mapping.number }, null, version);
                for (let pull of response.pulls) entries.set(pull.number, { pull, checkedAt: now });
            }
            detailOffset += 2;
            let current = new Set([...pulls.map(pull => pull.number), ...mappings.map(mapping => mapping.number)]);
            let cache: Cache = { scope: scope(config), checkedAt: now, partial: pages.at(-1)?.hasNext ?? false, pages, entries: [...entries.values()].filter(entry => current.has(entry.pull.number)).slice(0, 500) };
            await api.storage.set("cache", cache); check(version);
            state.update(value => ({ ...value, cache }));
            for (let entry of cache.entries.filter(entry => entry.checkedAt === now && mappings.some(mapping => mapping.number === entry.pull.number && mapping.repositoryId === entry.pull.repository_id))) {
                let before = old.entries.find(old => old.pull.number === entry.pull.number)?.pull, pull = entry.pull;
                if (!before || before.state !== pull.state || before.merged !== pull.merged || before.head_sha !== pull.head_sha) await api.publish("github-pull-state", { public: true, scope: cache.scope, repositoryId: pull.repository_id, number: pull.number, headSha: pull.head_sha, state: pull.state, merged: pull.merged, checkedAt: now });
                check(version);
            }
            await resolveMappings();
        } catch (error) { if (alive && version === epoch) state.update(value => ({ ...value, error: String(error) })); }
        finally { if (alive && version === epoch) { state.update(value => ({ ...value, busy: false })); schedule(Math.max(interval, get(state).retryAt - Date.now())); } }
    }
    async function map(number: number) {
        let value = get(state), config = value.config, pull = value.cache?.entries.find(entry => entry.pull.number === number)?.pull, selection = get(api.context).selection;
        if (!config || !pull || !selection) throw new Error("Select local changes and a cached pull request first");
        let version = epoch;
        let result = await api.query<RevisionSummaryResult>("query_revision_summary", { set: selection }); check(version);
        if (result.type !== "data" || result.value.type !== "Detail" || !result.value.headers.length) throw new Error("The selected local changes are unavailable");
        let headers = result.value.headers;
        if (!headers.some(header => header.id.commit.hex === pull.head_sha)) throw new Error("Selection must contain the exact cached GitHub head commit. Fetch it with your normal Git workflow, then select it in GG.");
        let mapping: Mapping = { scope: scope(config), repositoryId: pull.repository_id, number, headSha: pull.head_sha, changes: headers.map(header => ({ changeId: header.id.change.hex, commitId: header.id.commit.hex })) };
        let mappings = [...value.mappings.filter(item => item.scope !== mapping.scope || item.number !== number), mapping];
        if (mappings.length > 100) throw new Error("At most 100 explicit mappings can be saved");
        await api.storage.set("mappings", mappings); check(version); state.update(value => ({ ...value, mappings })); await resolveMappings();
    }
    async function unmap(number: number) { let value = get(state), version = epoch; let mappings = value.mappings.filter(mapping => mapping.scope !== (value.config && scope(value.config)) || mapping.number !== number); await api.storage.set("mappings", mappings); check(version); state.update(value => ({ ...value, mappings })); }
    return { state: { subscribe: state.subscribe }, load, configure, refresh, map, unmap, verify, dispose() { alive = false; epoch++; if (timer) clearTimeout(timer); unsubscribe(); } };
}
export type GithubController = ReturnType<typeof createGithubController>;
export let controllers = new WeakMap<PluginAPI, GithubController>();
