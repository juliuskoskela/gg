import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { RepoConfig } from "../app/messages/RepoConfig";
import type { RevsResult } from "../app/messages/RevsResult";
import { createContext, destroyContext, extractTestRepo, seedChangedFilesOpen, startGG, type TestContext } from "./harness";

// every line in the app is a border of one width in one of a few colours (doc/specs/lines.md). this walks what a
// person would see in each view and reports any line drawn another way, so a regression names the element to fix.

type Layout = { type: "tabs"; active: string; panels: string[] } | { type: "split"; direction: "row" | "column"; ratio: number; first: Layout; second: Layout };

let tabs = (...panels: string[]): Layout => ({ type: "tabs", active: panels[0], panels });
let row = (first: Layout, second: Layout, ratio = .5): Layout => ({ type: "split", direction: "row", ratio, first, second });

interface Scene {
    name: string;
    slug: string;
    root: Layout;
    prepare?: (page: Page) => Promise<void>;
}

let scenes: Scene[] = [
    {
        name: "timeline, description and diff with the changed-files browser",
        slug: "timeline",
        root: row(tabs("timeline"), { type: "split", direction: "column", ratio: .34, first: tabs("description"), second: tabs("diff") }, .42),
        prepare: async page => {
            await page.locator("#changed-files-drawer aside").waitFor();
            await page.locator("[data-panel-group=diff] diffs-container").first().waitFor();
        },
    },
    {
        name: "editor with a file open, and history",
        slug: "editor",
        root: row(tabs("tree"), tabs("history")),
        prepare: async page => {
            let tree = page.getByRole("tree", { name: "Repository files" });
            await tree.getByRole("treeitem", { name: "a.txt", exact: true }).click();
            let editor = page.getByRole("textbox", { name: /Contents of a\.txt/ });
            await editor.waitFor();
            // codemirror's search panel brings its own fields and buttons
            await editor.click();
            await page.keyboard.press("Control+f");
            await page.locator(".cm-search").waitFor();
            await page.getByRole("region", { name: "Repository history", exact: true }).locator("button[data-log-row]").first().waitFor();
        },
    },
    {
        name: "evolution and annotations",
        slug: "evolution",
        root: row(tabs("evolution"), tabs("annotations")),
        prepare: async page => {
            await page.getByRole("region", { name: "Evolution", exact: true }).locator("button[data-log-row]").first().waitFor();
        },
    },
    {
        name: "settings and terminal",
        slug: "settings",
        root: row(tabs("settings"), tabs("terminal")),
        prepare: async page => {
            await page.locator("[data-panel-group=settings]").getByRole("heading").first().waitFor();
            await page.getByRole("textbox", { name: /^Workspace terminal/ }).waitFor();
        },
    },
];

interface Finding { problem: string; element: string; view: string }

// the line roles, then state marks that keep their meaning colour (the lint allows the same list)
let lineColours = ["--line-seam", "--line-rule", "--line-popover", "--line-control", "--accent", "--negative", "--warning", "--focus-ring", "--view-focus-ring", "--field-focus-border", "--control-hover"];

// runs in the page: resolves the allowed widths and colours from the tokens, then checks every visible line
function audit({ scope, tokens }: { scope: string | null; tokens: string[] }): { findings: Finding[]; lines: string[] } {
    let shell = document.getElementById("shell")!;
    let probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;border-top-style:solid";
    shell.append(probe);
    let canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    let normalised = new Map<string, string>();
    // computed colours come back as rgb(), color(srgb …) or oklab(); paint each to compare them as bytes
    function rgba(colour: string) {
        let known = normalised.get(colour);
        if (known) return known;
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = "#000";
        canvas.fillStyle = colour;
        canvas.fillRect(0, 0, 1, 1);
        let value = [...canvas.getImageData(0, 0, 1, 1).data].join(",");
        normalised.set(colour, value);
        return value;
    }
    let widths = new Map(["--line-width", "--focus-width", "--indicator-width"].map(token => {
        probe.style.borderTopWidth = `var(${token})`;
        return [getComputedStyle(probe).borderTopWidth, token];
    }));
    let resolved = new Map<string, string>();
    // tokens resolve where they're used, so a component that redefines one (a theme preview) is judged by its own
    function allowed(element: Element) {
        let style = getComputedStyle(element), result = new Map<string, string>();
        for (let token of tokens) {
            let value = style.getPropertyValue(token).trim();
            if (!value) continue;
            let colour = resolved.get(value);
            if (colour === undefined) {
                probe.style.borderTopColor = value;
                colour = rgba(getComputedStyle(probe).borderTopColor);
                resolved.set(value, colour);
            }
            if (!result.has(colour)) result.set(colour, token);
        }
        return result;
    }

    let findings: Finding[] = [];
    // every line seen, so a failing run can be compared against what the view actually draws
    let lines: string[] = [];
    let root = scope ? document.querySelector(scope) : shell;
    if (!root) return { findings: [{ problem: `nothing matches ${scope}`, element: "", view: "" }], lines };

    function parentOf(node: Element): Element | null {
        let root = node.getRootNode();
        return node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    function describe(element: Element, pseudo = "") {
        let name = element.tagName.toLowerCase();
        let id = element.id ? `#${element.id}` : "";
        let classes = [...element.classList].filter(name => !name.startsWith("svelte-")).map(name => `.${name}`).join("");
        let label = element.getAttribute("aria-label") ?? element.getAttribute("data-panel-group");
        let root = element.getRootNode();
        let host = root instanceof ShadowRoot ? ` in <${root.host.tagName.toLowerCase()}>` : "";
        return `${name}${id}${classes}${pseudo}${label ? `[${label}]` : ""}${host}`;
    }
    function view(element: Element) {
        let node: Element | null = element;
        while (node) {
            let group = node.closest("[data-panel-group]");
            if (group) return group.getAttribute("data-panel-group")!;
            if (node.closest("[role=menu], [role=dialog], [role=listbox], [popover]")) return "popover";
            let root = node.getRootNode();
            node = root instanceof ShadowRoot ? root.host : null;
        }
        return "chrome";
    }
    // the colour a line is drawn over: a border in that colour knocks out space rather than drawing a line
    function backdrop(element: Element) {
        let node: Element | null = element;
        while (node) {
            let colour = rgba(getComputedStyle(node).backgroundColor);
            if (colour.endsWith(",255")) return colour;
            node = parentOf(node);
        }
        return "";
    }

    // what part of an element is actually on screen: inside every clipping ancestor and the viewport
    function clip(element: Element): DOMRect | null {
        let rect = element.getBoundingClientRect();
        let left = Math.max(rect.left, 0), top = Math.max(rect.top, 0), right = Math.min(rect.right, innerWidth), bottom = Math.min(rect.bottom, innerHeight);
        let node: Element | null = element;
        let opacity = Number(getComputedStyle(element).opacity);
        let clipped = true;
        while (node) {
            // fixed and top-layer surfaces escape their ancestors' overflow
            if (getComputedStyle(node).position === "fixed" || node.matches(":popover-open, dialog[open]")) clipped = false;
            let parent = parentOf(node);
            if (!parent) break;
            let style = getComputedStyle(parent);
            opacity *= Number(style.opacity);
            if (clipped && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
                let box = parent.getBoundingClientRect();
                if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
                if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
            }
            node = parent;
        }
        if (opacity < .05 || right - left < .5 || bottom - top < .5) return null;
        return new DOMRect(left, top, right - left, bottom - top);
    }

    interface Segment { horizontal: boolean; from: number; to: number; start: number; end: number; element: Element; side: string }
    let segments: Segment[] = [];
    let sides = ["Top", "Right", "Bottom", "Left"] as const;

    // the sides of a box that paint a visible line. a border in the colour of the box or of the surface around it
    // knocks out a gap (the diff gutter does this) rather than drawing a line
    function drawn(element: Element, style: CSSStyleDeclaration) {
        let behind: string[] | null = null;
        return sides.filter(side => {
            let colour = rgba(style[`border${side}Color`]);
            if (!parseFloat(style[`border${side}Width`]) || ["none", "hidden"].includes(style[`border${side}Style`]) || colour.endsWith(",0")) return false;
            let parent = parentOf(element);
            behind ??= [backdrop(element), parent ? backdrop(parent) : ""];
            return !behind.includes(colour);
        });
    }

    function check(element: Element, style: CSSStyleDeclaration, pseudo: string) {
        let name = describe(element, pseudo), where = view(element);
        let colours = allowed(element);
        for (let side of drawn(element, style)) {
            let width = style[`border${side}Width`], colour = rgba(style[`border${side}Color`]), kind = style[`border${side}Style`];
            lines.push(`${where}: ${name}: ${side.toLowerCase()} ${widths.get(width) ?? width} ${colours.get(colour) ?? style[`border${side}Color`]}`);
            if (!widths.has(width)) findings.push({ problem: `${side.toLowerCase()} border is ${width}, not --line-width`, element: name, view: where });
            if (!colours.has(colour)) findings.push({ problem: `${side.toLowerCase()} border colour ${style[`border${side}Color`]} is not a line colour`, element: name, view: where });
            // dashed marks a state (a disconnected bookmark) and snaps like a solid border
            if (kind !== "solid" && kind !== "dashed") findings.push({ problem: `${side.toLowerCase()} border is ${kind}`, element: name, view: where });
        }
        if (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && !rgba(style.outlineColor).endsWith(",0")) {
            if (!widths.has(style.outlineWidth)) findings.push({ problem: `outline is ${style.outlineWidth}`, element: name, view: where });
            if (!colours.has(rgba(style.outlineColor))) findings.push({ problem: `outline colour ${style.outlineColor} is not a line colour`, element: name, view: where });
        }
        // a shadow without blur draws a line that won't snap like a border
        for (let shadow of style.boxShadow === "none" ? [] : style.boxShadow.split(/,(?![^(]*\))/)) {
            let lengths = shadow.replace(/[a-z-]+\([^)]*\)/g, "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
            if (lengths.length >= 2 && !lengths[2] && lengths.some((length, index) => index !== 2 && length !== 0)) findings.push({ problem: `box-shadow ${shadow.trim()} draws a line`, element: name, view: where });
        }
    }

    function visit(element: Element) {
        let style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return;
        let box = clip(element);
        if (box && style.display !== "contents" && !(element instanceof SVGElement)) {
            check(element, style, "");
            let rect = element.getBoundingClientRect();
            for (let side of drawn(element, style)) {
                let width = parseFloat(style[`border${side}Width`]);
                let horizontal = side === "Top" || side === "Bottom";
                let from = side === "Top" ? rect.top : side === "Bottom" ? rect.bottom - width : side === "Left" ? rect.left : rect.right - width;
                let segment = { horizontal, from, to: from + width, start: Math.max(horizontal ? rect.left : rect.top, horizontal ? box.left : box.top), end: Math.min(horizontal ? rect.right : rect.bottom, horizontal ? box.right : box.bottom), element, side };
                let across = horizontal ? [box.top, box.bottom] : [box.left, box.right];
                if (segment.end - segment.start > 1 && segment.to > across[0] - .5 && segment.from < across[1] + .5) segments.push(segment);
            }
            for (let pseudo of ["::before", "::after"]) {
                let after = getComputedStyle(element, pseudo);
                if (after.content === "none" || after.content === "normal" || after.display === "none" || Number(after.opacity) < .05) continue;
                // a glyph drawn with borders (a checkbox tick) says so; the lint holds the matching exception
                if (after.getPropertyValue("--line-glyph").trim()) continue;
                check(element, after, pseudo);
                let width = parseFloat(after.width), height = parseFloat(after.height);
                // a thin painted strip is a line drawn without a border
                if ((width > 0 && width <= 2.5 || height > 0 && height <= 2.5) && Math.max(width, height) > 6 && !rgba(after.backgroundColor).endsWith(",0") && after.backgroundImage === "none") {
                    findings.push({ problem: `${pseudo} paints a ${width}x${height} background as a line`, element: describe(element, pseudo), view: view(element) });
                }
            }
            if (element.tagName === "HR" && style.borderTopStyle === "inset") findings.push({ problem: "default <hr>", element: describe(element), view: view(element) });
        }
        for (let child of element.children) visit(child);
        if (element.shadowRoot) for (let child of element.shadowRoot.children) visit(child);
    }
    visit(root);
    probe.remove();

    // collapsed table borders are shared by neighbouring cells and painted once
    let collapsed = (element: Element) => /^T[DH]$/.test(element.tagName) && getComputedStyle(element).borderCollapse === "collapse";
    // two lines sharing an edge read as one thick line: each line should be drawn by exactly one element
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            let a = segments[i], b = segments[j];
            if (a.horizontal !== b.horizontal || a.element === b.element || collapsed(a.element) && collapsed(b.element)) continue;
            let gap = Math.max(a.from, b.from) - Math.min(a.to, b.to);
            let overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
            if (gap <= .5 && overlap > 3) {
                findings.push({ problem: `doubled line: its ${a.side.toLowerCase()} border meets the ${b.side.toLowerCase()} border of ${describe(b.element)}`, element: describe(a.element), view: view(a.element) });
            }
        }
    }
    return { findings, lines };
}

describe("line audit", () => {
    let ctx: TestContext;
    let url: string;
    beforeAll(async () => {
        ctx = await createContext();
        extractTestRepo(ctx.tempDir);
        await writeFile(join(ctx.tempDir, "lines.ts"), "export let lines = 1;\n");
        url = await startGG(ctx);
        // two descriptions give the change versions for Evolution to list
        let config = await request<RepoConfig>("query/query_workspace", { path: ctx.tempDir });
        if (config.type !== "Workspace") throw new Error("Missing workspace");
        let id = { change: { type: "ChangeId", hex: "@", prefix: "@", rest: "", offset: null, is_divergent: false }, commit: config.status.working_copy };
        for (let description of ["Draft the line audit", "Audit every line"]) {
            let selection = await request<RevsResult>("query/query_revisions", { set: { from: id, to: id } });
            if (selection.type !== "Detail") throw new Error("Missing working copy");
            await request("mutate/describe_revision", { mutation: { id: selection.headers[0].id, new_description: description, reset_author: false }, options: { ignore_immutable: false } });
        }
        await seedChangedFilesOpen(ctx.page);
        await mkdir("e2e/results/line-audit", { recursive: true });
    });
    afterAll(async () => { if (ctx) await destroyContext(ctx); });

    async function request<T>(endpoint: string, body: object = {}): Promise<T> {
        let response = await fetch(`${url}/api/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${endpoint}: ${await response.text()}`);
        return response.json();
    }

    async function arrange(scene: Scene, theme: string) {
        let page = ctx.page;
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(`${url}/?inspect=@`);
        await page.evaluate(({ theme, root }) => {
            localStorage.setItem("gg.ui.theme", theme);
            localStorage.setItem("gg.dock.layout", JSON.stringify({ version: 1, root, compactActive: "timeline" }));
        }, { theme, root: scene.root });
        await page.reload();
        await page.locator("[data-panel-group]").first().waitFor();
        await scene.prepare?.(page);
        await page.mouse.move(0, 0);
        // nothing should hold focus, so the audit sees lines at rest
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await settle(page);
    }

    async function settle(page: Page) {
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
    }

    function report(findings: Finding[]) {
        return [...new Set(findings.map(finding => `${finding.view}: ${finding.element}: ${finding.problem}`))].sort();
    }

    async function check(name: string, scope: string | null) {
        await settle(ctx.page);
        await ctx.page.screenshot({ path: `e2e/results/line-audit/${name}.png` });
        let { findings, lines } = await ctx.page.evaluate(audit, { scope, tokens: lineColours });
        let found = report(findings);
        await writeFile(`e2e/results/line-audit/${name}.txt`, [...found, "", "lines:", ...lines].join("\n"));
        expect(found).toEqual([]);
    }

    // audits one floating surface on its own, so the views behind it don't hide its findings
    async function checkSurface(name: string, surface: Locator) {
        await surface.waitFor();
        await surface.evaluate(node => node.setAttribute("data-line-audit", ""));
        await check(name, "[data-line-audit]");
        await surface.evaluate(node => node.removeAttribute("data-line-audit"));
        await ctx.page.keyboard.press("Escape");
    }

    let cases = scenes.flatMap(scene => ["light", "dark"].map(theme => ({ scene, theme, name: scene.name })));
    it.each(cases)("draws every line in $name ($theme) as a token border", async ({ scene, theme }) => {
        await arrange(scene, theme);
        await check(`${scene.slug}-${theme}`, null);
    });

    it.each(["light", "dark"])("draws the lines of menus and the command palette as token borders (%s)", async theme => {
        let page = ctx.page;
        await arrange(scenes[0], theme);
        await page.getByRole("button", { name: "Views", exact: true }).click();
        await checkSurface(`views-menu-${theme}`, page.getByRole("menu").first());
        await page.locator(".graph .selection-item").filter({ hasText: "rename c.txt" }).first().click({ button: "right" });
        await checkSurface(`context-menu-${theme}`, page.getByRole("menu").first());
        let tools = page.getByRole("menubar").getByRole("menuitem", { name: "Tools", exact: true });
        await tools.focus();
        await tools.press("ArrowDown");
        await page.getByRole("menu", { name: "Tools" }).getByRole("menuitem", { name: "Commands…", exact: true }).click();
        await checkSurface(`palette-${theme}`, page.getByRole("dialog", { name: "Commands", exact: true }));
    });

    it.each(["light", "dark"])("draws the lines of a note being written and read as token borders (%s)", async theme => {
        let page = ctx.page;
        await arrange({ name: "annotations", slug: "annotations", root: row(tabs("timeline"), tabs("annotations"), .4) }, theme);
        await page.locator(".graph .selection-item").filter({ hasText: "rename c.txt" }).first().click({ button: "right" });
        await page.getByRole("menuitem", { name: "Annotate change…" }).click();
        // a note with a quote, a rule and a table draws every line the markdown renderer can
        await page.getByRole("textbox", { name: "Note" }).fill(`Lines in a ${theme} note\n\n> quoted\n\n---\n\n| a | b |\n| --- | --- |\n| 1 | 2 |`);
        await page.mouse.move(0, 0);
        await check(`note-editor-${theme}`, null);
        await page.getByRole("button", { name: "Save note" }).click();
        let notes = page.getByRole("list", { name: "Notes" });
        let note = notes.getByRole("button", { name: new RegExp(`Lines in a ${theme} note`) });
        await note.waitFor();
        // saving usually leaves the note open, and the row toggles it
        if (await note.getAttribute("aria-expanded") !== "true") await note.click();
        await page.locator("[data-panel-group=annotations] table").waitFor();
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await check(`note-${theme}`, null);
    });
});
