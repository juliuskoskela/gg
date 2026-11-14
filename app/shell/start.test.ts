import { describe, expect, it } from "vitest";
import { folderName, initTarget, loadProblem, parentPath, shortenHome, splitForTruncation, type LoadError } from "./start";

let error = (fields: Partial<LoadError>): LoadError => ({ type: "LoadError", absolute_path: "/home/ada/work/site", message: "no repo", kind: "Uninitialized", home_dir: "/home/ada", ...fields });

describe("initTarget", () => {
    it("offers a plain folder, colocated by choice", () => {
        expect(initTarget(error({}))).toEqual({ path: "/home/ada/work/site", opened: "/home/ada/work/site", git: false, colocateRequired: false });
    });
    it("initializes a Git checkout at its root, where colocation keeps the history", () => {
        expect(initTarget(error({ absolute_path: "/home/ada/work/site/docs", git_root: "/home/ada/work/site" })))
            .toEqual({ path: "/home/ada/work/site", opened: "/home/ada/work/site/docs", git: true, colocateRequired: true });
    });
    it("offers nothing for paths that can't hold a repository", () => {
        for (let kind of ["NotFound", "NotADirectory", "Other"] as const) expect(initTarget(error({ kind }))).toBeNull();
    });
    it("doesn't offer the home folder or a root, where a desktop launch starts", () => {
        expect(initTarget(error({ absolute_path: "/home/ada" }))).toBeNull();
        expect(initTarget(error({ absolute_path: "/home/ada/" }))).toBeNull();
        expect(initTarget(error({ absolute_path: "/" }))).toBeNull();
        expect(initTarget(error({ absolute_path: "C:\\" }))).toBeNull();
        expect(initTarget(error({ absolute_path: "" }))).toBeNull();
    });
    it("treats a Git checkout of the whole home folder as no checkout", () => {
        expect(initTarget(error({ git_root: "/home/ada" }))).toMatchObject({ path: "/home/ada/work/site", git: false, colocateRequired: false });
    });
});

describe("loadProblem", () => {
    it("is quiet for a folder that can be initialized", () => {
        expect(loadProblem(error({}))).toBeNull();
    });
    it("says a path doesn't exist, and that a recent one has gone", () => {
        expect(loadProblem(error({ kind: "NotFound" }))).toBe("There is no folder at ~/work/site. Check the path, or choose another folder.");
        expect(loadProblem(error({ kind: "NotFound" }), ["/home/ada/work/site"])).toMatch(/^~\/work\/site no longer exists\./);
    });
    it("says a file isn't a folder", () => {
        expect(loadProblem(error({ kind: "NotADirectory", absolute_path: "/tmp/notes.txt" }))).toBe("/tmp/notes.txt is a file. Open the folder that contains the repository instead.");
    });
    it("passes other failures through with the path", () => {
        expect(loadProblem(error({ kind: "Other", message: "corrupt op heads" }))).toBe("GG couldn't open ~/work/site: corrupt op heads");
    });
});

describe("paths", () => {
    it("shortens only the home folder itself and paths inside it", () => {
        expect(shortenHome("/home/ada", "/home/ada")).toBe("~");
        expect(shortenHome("/home/ada/work", "/home/ada/")).toBe("~/work");
        expect(shortenHome("/home/adam/work", "/home/ada")).toBe("/home/adam/work");
        expect(shortenHome("C:\\Users\\ada\\work", "C:\\Users\\ada")).toBe("~\\work");
        expect(shortenHome("/srv/work", null)).toBe("/srv/work");
    });
    it("names folders and their parents", () => {
        expect(folderName("/home/ada/work/")).toBe("work");
        expect(parentPath("/home/ada/work")).toBe("/home/ada");
        expect(parentPath("/work")).toBe("/");
        expect(parentPath("work")).toBe("");
    });
    it("keeps the last folder whole when truncating", () => {
        expect(splitForTruncation("~/.paseo/worktrees/07eb2bw2")).toEqual({ head: "~/.paseo/worktrees/", tail: "07eb2bw2" });
        expect(splitForTruncation("~")).toEqual({ head: "", tail: "~" });
    });
});
