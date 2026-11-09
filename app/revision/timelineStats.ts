import { query } from "../ipc";
import type { RevId } from "../messages/RevId";
import type { RevChange } from "../messages/RevChange";
import type { RevisionSummaryResult } from "../messages/RevisionSummaryResult";

type Listener = (value: RevChange[] | null) => void;
type Job = { key: string; id: RevId; started: boolean; listeners: Set<Listener> };
let cache = new Map<string, RevChange[]>();
let pending = new Map<string, Job>();
let waiting: Job[] = [];
let active = 0;

function pump() {
    while (active < 2 && waiting.length) {
        let job = waiting.shift()!;
        if (!job.listeners.size) continue;
        job.started = true;
        active++;
        void run(job);
    }
}

async function run(job: Job) {
    let changes: RevChange[] | null = null;
    try {
        let result = await query<RevisionSummaryResult>("query_revision_summary", { set: { from: job.id, to: job.id } });
        if (result.type === "data" && result.value?.type === "Detail" && !result.value.conflicts.length && result.value.changes.every(change => change.stat)) {
            changes = result.value.changes.map(change => ({ ...change, hunks: [], stat: change.stat! }));
            cache.set(job.key, changes);
            while (cache.size > 256) cache.delete(cache.keys().next().value!);
        }
    } finally {
        pending.delete(job.key);
        job.listeners.forEach(listener => listener(changes));
        active--;
        pump();
    }
}

export function timelineStats(repository: string, id: RevId, signal?: AbortSignal): Promise<RevChange[] | null> {
    if (signal?.aborted) return Promise.resolve(null);
    let key = JSON.stringify([repository, id.commit.hex]);
    let cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    let job = pending.get(key);
    if (!job) {
        job = { key, id, started: false, listeners: new Set() };
        pending.set(key, job);
        waiting.push(job);
    }
    let request = job;
    return new Promise(resolve => {
        let complete: Listener = value => {
            signal?.removeEventListener("abort", abort);
            request.listeners.delete(complete);
            resolve(value);
        };
        let abort = () => {
            complete(null);
            if (!request.started && !request.listeners.size) {
                waiting = waiting.filter(job => job !== request);
                pending.delete(key);
            }
        };
        request.listeners.add(complete);
        signal?.addEventListener("abort", abort, { once: true });
        pump();
    });
}
