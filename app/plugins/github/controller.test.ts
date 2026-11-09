import { afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { PluginAPI, PluginContext } from "../types";
import type { GithubPull } from "../../messages/GithubPull";
import type { GithubRequest } from "../../messages/GithubRequest";
import type { GithubResponse } from "../../messages/GithubResponse";
import type { RevHeader } from "../../messages/RevHeader";
import { createGithubController } from "./controller";
import { emptyCache, retryTime, verify } from "./model";

let head = "a".repeat(40), base = "b".repeat(40);
let config = { owner: "example", repo: "project", reviewer: "reviewer", enabled: true };
let pull: GithubPull = { number: 7, repository_id: "99", title: "A feature", author: "author", state: "open", draft: false, merged: false, head_sha: head, base_sha: base, head_ref: "topic", requested_reviewers: ["reviewer"], updated_at: "2026-11-10T00:00:00Z" };
function response(pulls = [pull]): GithubResponse { return { status: 200, etag: '"etag"', retry_after_seconds: null, reset_at_seconds: null, remaining: 50, has_next: false, pulls }; }
function header(commit = head): RevHeader { return { id: { change: { type: "ChangeId", hex: "change", prefix: "change", rest: "" }, commit: { type: "CommitId", hex: commit, prefix: commit, rest: "" } }, description: { lines: ["A feature"] } } as unknown as RevHeader; }
let disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup(saved = new Map<string, unknown>()) {
    vi.useFakeTimers();
    let context = writable<PluginContext>({ repository: "repo", workspace: "/repo", status: undefined, selection: { from: header().id, to: header().id } });
    let read = vi.fn(async (_request: GithubRequest) => response());
    let query = vi.fn(async () => ({ type: "data", value: { type: "Detail", headers: [header()], parents: [], changes: [], conflicts: [] } }));
    let write = vi.fn(async (key: string, value: unknown) => { saved.set(key, structuredClone(value)); });
    let api = { context, query, github: { read }, storage: { get: async (key: string) => saved.get(key), set: write }, publish: vi.fn(async () => ({})) } as unknown as PluginAPI;
    let controller = createGithubController(api); disposals.push(controller.dispose);
    return { controller, read, query, write, saved, api };
}
describe("public GitHub cache", () => {
    it("does not contact the network until the repository has explicit public-read consent", async () => {
        let { controller, read } = setup(); await controller.load(); await controller.refresh(); expect(read).not.toHaveBeenCalled();
        await controller.configure({ ...config, enabled: false }); await controller.refresh(); expect(read).not.toHaveBeenCalled();
        await controller.configure(config); await controller.refresh(); expect(read).toHaveBeenCalledOnce(); expect(get(controller.state).cache?.entries[0].pull.number).toBe(7);
    });
    it("uses validators and keeps the previous page on 304", async () => {
        let { controller, read } = setup(); await controller.load(); await controller.configure(config); await controller.refresh();
        vi.setSystemTime(Date.now() + 61000); read.mockResolvedValue({ ...response([]), status: 304 }); await controller.refresh();
        expect(read.mock.calls.at(-1)?.[0]).toEqual({ owner: "example", repo: "project", endpoint: { type: "List", page: 1 }, etag: '"etag"' });
        expect(get(controller.state).cache?.entries[0].pull.title).toBe("A feature");
    });
    it("bounds pagination and labels incomplete lists", async () => {
        let { controller, read } = setup(); read.mockResolvedValue({ ...response(), has_next: true }); await controller.load(); await controller.configure(config); await controller.refresh();
        expect(read).toHaveBeenCalledTimes(3); expect(get(controller.state).cache?.partial).toBe(true);
    });
    it("retains cached data on a rate error and honors persisted cooldown after reopening", async () => {
        let { controller, read, saved } = setup(); await controller.load(); await controller.configure(config); await controller.refresh();
        vi.setSystemTime(Date.now() + 61000); read.mockResolvedValue({ ...response([]), status: 429, retry_after_seconds: 3600 }); await controller.refresh();
        expect(get(controller.state).cache?.entries).toHaveLength(1); expect(get(controller.state).error).toContain("429");
        controller.dispose(); let next = setup(saved); await next.controller.load(); await next.controller.refresh(); expect(next.read).not.toHaveBeenCalled();
    });
    it("requires an exact cached head before storing a local mapping and detects rewrites", async () => {
        let { controller, query } = setup(); await controller.load(); await controller.configure(config); await controller.refresh();
        query.mockResolvedValue({ type: "data", value: { type: "Detail", headers: [header(base)], parents: [], changes: [], conflicts: [] } });
        await expect(controller.map(7)).rejects.toThrow("exact cached GitHub head");
        query.mockResolvedValue({ type: "data", value: { type: "Detail", headers: [header()], parents: [], changes: [], conflicts: [] } }); await controller.map(7);
        let mapping = get(controller.state).mappings[0]; expect(verify(mapping, pull, [header()])).toBe("verified"); expect(verify(mapping, pull, [header(base)])).toBe("rewritten"); expect(verify(mapping, { ...pull, head_sha: base }, [header()])).toBe("remote-changed"); expect(verify(mapping, pull, [null])).toBe("unavailable");
    });
    it("refreshes a mapped pull missing from the open list without treating disappearance as merge", async () => {
        let { controller, read, api } = setup(); await controller.load(); await controller.configure(config); await controller.refresh(); await controller.map(7);
        vi.setSystemTime(Date.now() + 61000);
        read.mockImplementation(async (request: any) => request.endpoint.type === "List" ? response([]) : response([{ ...pull, state: "closed", merged: true }]));
        await controller.refresh(); expect(get(controller.state).cache?.entries[0].pull.merged).toBe(true); expect(api.publish).toHaveBeenCalledWith("github-pull-state", expect.objectContaining({ merged: true, repositoryId: "99" }));
    });
    it("drops in-flight results after disable or disposal", async () => {
        let { controller, read, write } = setup(); await controller.load(); await controller.configure(config);
        let resolve!: (value: GithubResponse) => void; read.mockImplementation(() => new Promise(done => resolve = done));
        let pending = controller.refresh(); await controller.configure({ ...config, enabled: false }); resolve(response()); await pending;
        expect(write.mock.calls.filter(([key]) => key === "cache")).toHaveLength(0); expect(get(controller.state).cache).toBeNull();
    });
    it("loads last successful cache before a network refresh", async () => {
        let cache = { ...emptyCache(config), checkedAt: Date.now(), entries: [{ pull, checkedAt: Date.now() }] };
        let { controller, read } = setup(new Map<string, unknown>([["configuration", config], ["cache", cache]])); await controller.load(); expect(get(controller.state).cache?.entries).toHaveLength(1); expect(read).not.toHaveBeenCalled();
        expect(retryTime(1000, 429, 120, null)).toBe(121000);
    });
});
