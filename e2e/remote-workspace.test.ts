import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile, access, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { PROJECT_ROOT } from "./harness";

let temp: string, repo: string, remoteA: string, remoteB: string, server: ChildProcess, base: string;
function run(program: string, args: string[], cwd = repo) { return execFileSync(program, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
async function api(kind: string, command: string, value: unknown) {
    let response = await fetch(`${base}/api/${kind}/${command}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    let text = await response.text();
    expect(response.ok, `${command}: ${text}`).toBe(true);
    return JSON.parse(text);
}
function query(command: string, value: unknown = {}) { return api("query", command, value); }
function mutate(command: string, mutation: unknown) { return api("mutate", command, { mutation, options: { ignore_immutable: false } }); }
async function freePort(): Promise<number> { let socket = createServer(); await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve)); let port = (socket.address() as { port: number }).port; await new Promise<void>(resolve => socket.close(() => resolve())); return port; }
async function waitForServer() { for (let i = 0; i < 100; i++) { try { let response = await fetch(base); if (response.ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("GG did not start"); }

describe("isolated remotes and workspaces", () => {
    beforeEach(async () => {
        temp = await mkdtemp(join(tmpdir(), "gg-local-remote-")); repo = join(temp, "repo"); remoteA = join(temp, "a.git"); remoteB = join(temp, "b.git");
        run("git", ["init", "--bare", remoteA], temp); run("git", ["init", "--bare", remoteB], temp);
        run("jj", ["git", "init", "--colocate", repo], temp);
        run("jj", ["config", "set", "--repo", "user.name", "Test User"]); run("jj", ["config", "set", "--repo", "user.email", "test@example.invalid"]);
        await writeFile(join(repo, "file.txt"), "one\n"); run("jj", ["describe", "-m", "first"]); run("jj", ["bookmark", "create", "alpha"]); run("jj", ["bookmark", "create", "beta"]);
        run("jj", ["git", "remote", "add", "origin", remoteA]); run("jj", ["git", "remote", "add", "other", remoteB]);
        run("jj", ["workspace", "add", "--name", "secondary", "--no-colocate", join(temp, "secondary")]);
        let tool = join(temp, "diff-tool");
        await writeFile(tool, `#!/usr/bin/env bash\nprintf '%s\\n' "$1" "$2" > '${join(temp, "tool-args")}'\ncat "$1" > '${join(temp, "tool-left")}'\ncat "$2" > '${join(temp, "tool-right")}'\n`);
        await chmod(tool, 0o755);
        run("jj", ["config", "set", "--repo", "ui.diff-formatter", JSON.stringify([tool, "$left", "$right"])]);
        let port = await freePort(); base = `http://127.0.0.1:${port}`;
        server = spawn(join(PROJECT_ROOT, "target/debug/gg"), ["web", repo, "--no-launch", "--foreground", "--port", String(port)], { cwd: repo, stdio: "ignore" });
        await waitForServer(); let config = await query("query_workspace", { path: repo }); expect(config.type).toBe("Workspace");
    });
    afterEach(async () => { server?.kill(); await rm(temp, { recursive: true, force: true }); });

    it("pushes only the requested bookmark and remote, then fetches from the selected local remote", async () => {
        let rows = (await query("query_log", { revset: "bookmarks()" })).rows;
        let refs = rows.flatMap((row: any) => row.revision.refs);
        let alpha = refs.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "alpha");
        expect(alpha).toBeTruthy();
        let pushed = await mutate("git_push", { refspec: { type: "RemoteBookmark", remote_name: "origin", bookmark_ref: alpha }, input: null });
        expect(pushed.type).toBe("Updated");
        expect(run("git", ["--git-dir", remoteA, "show-ref", "--heads"]).split("\n").map(line => line.split(" ")[1])).toEqual(["refs/heads/alpha"]);
        expect(run("git", ["--git-dir", remoteB, "for-each-ref", "--format=%(refname)", "refs/heads"])).toBe("");
        let fetched = await mutate("git_fetch", { refspec: { type: "RemoteBookmark", remote_name: "origin", bookmark_ref: alpha }, input: null });
        expect(["Updated", "Unchanged"]).toContain(fetched.type);
    });

    it("pushes tracked bookmark scopes to the correct remotes", async () => {
        let refs = async () => (await query("query_log", { revset: "bookmarks() | remote_bookmarks()" })).rows.flatMap((row: any) => row.revision.refs);
        let initial = await refs();
        let alpha = initial.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "alpha");
        let beta = initial.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "beta");
        for (let [remote_name, bookmark_ref] of [["origin", alpha], ["other", beta]]) {
            let result = await mutate("git_push", { refspec: { type: "RemoteBookmark", remote_name, bookmark_ref }, input: null });
            expect(result.type).toBe("Updated");
        }
        let remoteRefs = await refs();
        for (let [name, remote] of [["alpha", "origin"], ["beta", "other"]]) {
            let ref = remoteRefs.find((item: any) => item.type === "RemoteBookmark" && item.bookmark_name === name && item.remote_name === remote);
            expect(ref).toBeTruthy();
            if (!ref.is_tracked) expect((await mutate("track_bookmark", { ref })).type).toBe("Updated");
        }
        let old = run("git", ["--git-dir", remoteA, "rev-parse", "refs/heads/alpha"]);
        run("jj", ["new", "-m", "second"]); await writeFile(join(repo, "file.txt"), "two\n");
        run("jj", ["bookmark", "set", "alpha", "beta", "-r", "@"]);
        await query("query_snapshot");
        let updated = await refs(); beta = updated.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "beta");
        let pushedOrigin = await mutate("git_push", { refspec: { type: "AllBookmarks", remote_name: "origin" }, input: null });
        expect(pushedOrigin.type).toBe("Updated");
        let originHead = run("git", ["--git-dir", remoteA, "rev-parse", "refs/heads/alpha"]);
        expect(originHead).not.toBe(old);
        expect(run("git", ["--git-dir", remoteB, "rev-parse", "refs/heads/beta"])).toBe(old);
        let pushedBeta = await mutate("git_push", { refspec: { type: "AllRemotes", bookmark_ref: beta }, input: null });
        expect(pushedBeta.type).toBe("Updated");
        expect(run("git", ["--git-dir", remoteB, "rev-parse", "refs/heads/beta"])).toBe(originHead);
        expect(run("git", ["--git-dir", remoteA, "for-each-ref", "--format=%(refname)", "refs/heads/beta"])).toBe("");
    });

    it("fetches one bookmark across configured remotes without fetching an unrelated bookmark", async () => {
        let refs = async () => (await query("query_log", { revset: "all()" })).rows.flatMap((row: any) => row.revision.refs);
        let initial = await refs();
        let alpha = initial.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "alpha");
        let beta = initial.find((ref: any) => ref.type === "LocalBookmark" && ref.bookmark_name === "beta");
        for (let remote_name of ["origin", "other"]) {
            expect((await mutate("git_push", { refspec: { type: "RemoteBookmark", remote_name, bookmark_ref: alpha }, input: null })).type).toBe("Updated");
        }
        let commit = run("git", ["--git-dir", remoteA, "rev-parse", "refs/heads/alpha"]);
        for (let remote of [remoteA, remoteB]) {
            run("git", ["--git-dir", remote, "update-ref", "refs/heads/beta", commit]);
            run("git", ["--git-dir", remote, "update-ref", "refs/heads/unrelated", commit]);
        }
        expect((await mutate("git_fetch", { refspec: { type: "AllRemotes", bookmark_ref: beta }, input: null })).type).toBe("Updated");
        let fetched = await refs();
        expect(fetched.filter((ref: any) => ref.type === "RemoteBookmark" && ref.bookmark_name === "beta").map((ref: any) => ref.remote_name).sort()).toEqual(["origin", "other"]);
        expect(fetched.some((ref: any) => ref.type === "RemoteBookmark" && ref.bookmark_name === "unrelated")).toBe(false);
    });

    it("only renames the current workspace and forgets another without deleting its files", async () => {
        let badRename = await mutate("rename_workspace", { name: "secondary", new_name: "renamed" });
        expect(badRename.type).toBe("PreconditionError"); expect(badRename.message).toContain("current workspace");
        let badForget = await mutate("forget_workspace", { name: "default" });
        expect(badForget.type).toBe("PreconditionError");
        let renamed = await mutate("rename_workspace", { name: "default", new_name: "primary" });
        expect(renamed.type).toBe("Updated");
        expect(await query("query_workspace_identity")).toBe("primary");
        let forgotten = await mutate("forget_workspace", { name: "secondary" });
        expect(forgotten.type).toBe("Updated");
        await access(join(temp, "secondary", ".jj"));
        expect(run("jj", ["workspace", "list"])).not.toContain("secondary:");
    });
    it("opens another workspace in web mode and reports its new configuration", async () => {
        expect(await query("query_workspace_identity")).toBe("default");
        let opened = await mutate("open_workspace", { name: "secondary" });
        expect(opened.type).toBe("Reconfigured");
        expect(opened.new_config.absolute_path).toBe(join(temp, "secondary"));
        expect(await query("query_workspace_identity")).toBe("secondary");
        let missing = await mutate("open_workspace", { name: "missing" });
        expect(missing.type).toBe("PreconditionError");
    });

    it("advertises a configured external diff tool and passes parent and revision files", async () => {
        let config = await query("query_workspace", { path: repo });
        expect(config.has_external_diff_tool).toBe(true);
        let row = (await query("query_log", { revset: "alpha" })).rows[0];
        let result = await mutate("external_diff", { id: row.revision.id, path: { repo_path: "file.txt", relative_path: "file.txt" } });
        expect(result.type).toBe("Unchanged");
        await expect.poll(async () => { try { return await readFile(join(temp, "tool-right"), "utf8"); } catch { return ""; } }).toBe("one\n");
        expect(await readFile(join(temp, "tool-left"), "utf8")).toBe("");
        let args = await readFile(join(temp, "tool-args"), "utf8");
        expect(args).toContain("left/file.txt"); expect(args).toContain("right/file.txt");
    });

});
