// run from the repository root after building target/debug/gg.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
let root = process.cwd(), dir = await mkdtemp(join(tmpdir(), 'gg-loading-'));
let backend, vite, browser;
let output = process.argv[2] ?? '.taste-skill/studio/loading.json';
try {
    execFileSync('unzip', ['-q', resolve('res/test-repo.zip'), '-d', dir]);
    await mkdir(join(dir, 'scale'), { recursive: true });
    for (let i = 0; i < 270; i++) await writeFile(join(dir, 'scale', `file-${String(i).padStart(3, '0')}.txt`), Array.from({ length: i === 0 ? 5000 : 200 }, (_, line) => `file ${i} line ${line}: a reproducible line of repository content for diff loading\n`).join(''));
    backend = spawn(resolve('target/debug/gg'), ['web', dir, '--port', '0', '--no-launch', '--foreground'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let url = await new Promise((resolveUrl, reject) => {
        let timer = setTimeout(() => reject(new Error('backend did not start')), 30000);
        let inspect = chunk => { let found = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (found) { clearTimeout(timer); resolveUrl(found[0]); } };
        backend.stderr.on('data', inspect); backend.stdout.on('data', inspect); backend.on('error', reject);
    });
    let request = async (name, args = {}) => {
        let start = performance.now();
        let response = await fetch(`${url}/api/query/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, client_id: 'loading-measurement' }) });
        if (!response.ok) throw new Error(`${name}: ${response.status}`);
        let text = await response.text();
        return { ms: performance.now() - start, bytes: Buffer.byteLength(text), data: JSON.parse(text) };
    };
    let config = (await request('query_workspace', { path: dir })).data;
    let status = (await request('query_snapshot')).data ?? config.status;
    let id = { change: { type: 'ChangeId', hex: '@', prefix: '@', rest: '', offset: null, is_divergent: false }, commit: status.working_copy };
    let set = { from: id, to: id };
    let summary = (await request('query_revision_summary', { set })).data;
    let path = summary.changes.find(file => file.path.repo_path === 'scale/file-000.txt').path;
    let samples = [];
    for (let i = 0; i < 6; i++) {
        let queries = i % 2 ? ['query_revision_summary', 'query_revision_diff', 'query_revisions'] : ['query_revisions', 'query_revision_diff', 'query_revision_summary'];
        for (let name of queries) { let { ms, bytes } = await request(name, { set, ...(name === 'query_revision_diff' ? { path } : {}) }); samples.push({ iteration: i, name, ms, bytes }); }
    }
    vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: url, changeOrigin: true } } } });
    await vite.listen();
    let address = vite.httpServer.address();
    browser = await chromium.launch({ headless: true, executablePath: process.env.GG_TEST_BROWSER || undefined });
    let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { window.__tasks = []; new PerformanceObserver(list => window.__tasks.push(...list.getEntries().map(({ duration }) => duration))).observe({ type: 'longtask', buffered: true }); });
    let requests = [];
    page.on('request', req => { if (req.url().includes('/api/query/query_revision_')) requests.push({ endpoint: req.url().split('/').at(-1), body: req.postDataJSON() }); });
    let started = performance.now();
    await page.goto(`http://127.0.0.1:${address.port}/?inspect=${id.commit.hex}&file=scale%2Ffile-000.txt`);
    await page.locator('diffs-container').waitFor();
    let renderMs = performance.now() - started;
    await page.getByRole('button', { name: 'Choose changed file' }).click();
    await page.getByRole('searchbox', { name: 'Filter changed files' }).waitFor();
    let metrics = await page.evaluate(() => ({ domNodes: document.querySelectorAll('*').length, fileRows: document.querySelectorAll('#changed-files .selection-item').length, longTasks: window.__tasks, overflow: document.documentElement.scrollWidth > innerWidth }));
    let report = { environment: { node: process.version, browser: await browser.version(), platform: process.platform, viewport: '390x844', frontend: 'Vite development; no CPU throttling' }, workload: { files: 270, firstFileLines: 5000, otherFileLines: 200 }, samples, rendered: { renderMs, ...metrics, requests } };
    await mkdir(join(output, '..'), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally { await browser?.close(); await vite?.close(); backend?.kill(); await rm(dir, { recursive: true, force: true }); }
