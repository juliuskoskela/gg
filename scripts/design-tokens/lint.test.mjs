import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, inspectSource, rulesFor } from "./lint.mjs";

let component = css => `<div></div><style>${css}</style>`;

test("semantic roles and resets pass, including color mixing and geometry", () => {
    assert.deepEqual(inspectSource("app/Test.svelte", component(`
        div { font: var(--font-body); color: color-mix(in srgb, var(--negative) 20%, transparent);
          border: var(--line-width) solid var(--line-rule); width: 16px; padding: 0; gap: var(--gap-row); margin-inline: auto; }
    `)), []);
});

test("rejects actual typography, colors and rhythm literals, not CSS comments or URLs", () => {
    let found = inspectSource("app/Test.svelte", component(`
      /* color: red; */
      div { font-size: var(--type-ui); line-height: 1.5; font-weight: 500; font: 13px sans-serif;
        color: red; background: url("red.svg#fff"); border: 1px solid #fff;
        box-shadow: 0 0 2px rgb(0 0 0 / 20%); padding: 0 12px; row-gap: 4px; }
    `));
    assert.deepEqual(found.map(item => item.rule), ["typography", "typography", "typography", "typography", "color", "color", "line", "color", "spacing", "spacing"]);
    assert.equal(found.at(-1).scope, "CSS div");
});

test("only token definitions have raw color exemption; global rules do not", () => {
    assert.deepEqual(rulesFor("--ink", "#fff", "app/global.css"), []);
    assert.deepEqual(rulesFor("--ink", "#fff", "app/display/palettes.css"), []);
    assert.deepEqual(rulesFor("color", "#fff", "app/global.css"), ["color"]);
    assert.deepEqual(rulesFor("--ink", "#fff", "app/Other.svelte"), ["color"]);
    assert.deepEqual(rulesFor("font-size", "14px", "app/global.css"), []);
});

test("nested media and pseudo rules retain distinct scope", () => {
    let found = inspectSource("app/Test.svelte", component(`@media (width < 500px) { .small:hover { gap: 3px; } }`));
    assert.equal(found[0].scope, "CSS @media (width < 500px) .small:hover");
});

test("checks inline style, style directives, and templates without parsing expressions as CSS", () => {
    let source = `<div style="color:red; padding: {space}px" style:font-size={size} style:gap="5px"/><span style={'background: blue'} style:color={"red"}/>`;
    let found = inspectSource("app/Test.svelte", source);
    assert.deepEqual(found.map(item => item.rule), ["color", "typography", "spacing", "color", "color"]);
});

test("checks script styles, setProperty, CSS strings and canvas text", () => {
    let source = `let color = "#abc"; // data alone is not a style
      element.style.color = "#abc";
      element.style.setProperty("gap", "9px");
      element.style.cssText = "font-weight: 600; padding: 3px;";
      let css = ".x { color: oklch(0.7 0.1 20); }";
      context.font = \`\${size}px sans-serif\`;
      let label = "code:";`;
    let found = inspectSource("app/Test.ts", source);
    assert.deepEqual(found.map(item => item.rule), ["color", "spacing", "typography", "spacing", "color", "typography"]);
});

test("narrow exception applies to the immediately following declaration only", () => {
    let found = inspectSource("app/Test.svelte", component(`div {
      /* design-token-allow spacing: renderer rows align to the external grid */
      gap: 1px; padding: 1px;
    }`));
    assert.deepEqual(found.map(item => item.property), ["padding"]);
    assert.throws(() => inspectSource("app/Test.svelte", component(`div { /* design-token-allow spacing: okay */ gap: 1px; }`)), /specific reason/);
});

test("baseline is exact, count limited, location stable and shrinks with fixed violations", () => {
    let found = inspectSource("app/Test.svelte", component(`.a { gap: 3px; }`));
    let baseline = found.map(({ line, ...item }) => ({ ...item, count: 1 }));
    assert.deepEqual(compare(found.map(item => ({ ...item, line: 99 })), baseline), { added: [], stale: [] });
    assert.equal(compare([...found, ...found], baseline).added.length, 1);
    assert.equal(compare(found.map(item => ({ ...item, value: "4px" })), baseline).added.length, 1);
    assert.equal(compare(found.map(item => ({ ...item, scope: "CSS .b" })), baseline).added.length, 1);
    assert.equal(compare([], baseline).stale.length, 1);
});


test("spacing checks percentages, relative units and literal fallbacks without flagging zero", () => {
    for (let value of ["10%", "2lh", "1dvw", "1e1px", "var(--gap-row, 2px)", "calc(var(--gap-row) + 2px)"]) {
        assert.deepEqual(rulesFor("padding-inline", value, "app/Test.svelte"), ["spacing"], value);
    }
    for (let value of ["0px", "0%", "var(--gap-row)", "calc(var(--gap-row) * 2)"]) {
        assert.deepEqual(rulesFor("gap", value, "app/Test.svelte"), [], value);
    }
});


test("style objects and computed style writes cannot bypass token checks", () => {
    let source = `let styles = {fontSize: "12px", fontWeight: 500, padding: 6, background: "#123", gap: "var(--gap-row)"};
        element.style["color"] = "blue";`;
    assert.deepEqual(inspectSource("app/Test.ts", source).map(item => item.rule), ["typography", "typography", "spacing", "color", "color"]);
});


test("JavaScript styles use the same rules", () => {
    assert.deepEqual(inspectSource("app/example.js", 'element.style.color = "red";').map(item => item.rule), ["color"]);
});


test("static fragments inside script templates and concatenations are checked", () => {
    let source = 'element.style.color = "#" + "fff"; element.style.backgroundColor = `red`; let styles = {padding: -4};';
    assert.deepEqual(inspectSource("app/example.ts", source).map(item => item.rule), ["color", "color", "spacing"]);
});


test("conditional and fallback inline styles inspect every statically visible branch", () => {
    let source = `<div style={ok ? 'color:red' : 'color:blue'} style:color={custom || 'orange'} style:font={ok ? 'var(--font-label)' : 'var(--font-body)'}/>`;
    let found = inspectSource("app/Test.svelte", source);
    assert.deepEqual(found.map(item => item.value), ["red", "blue", "orange"]);
});

test("conditional and fallback script styles inspect every statically visible branch", () => {
    let source = `node.style.color = ok ? 'red' : 'blue';
        node.style.backgroundColor = custom ?? 'orange';
        node.style.setProperty('border-color', ok ? '#111' : '#222');
        let styles = {font: ok ? 'var(--font-body)' : 'var(--font-label)'};`;
    let found = inspectSource("app/Test.ts", source);
    assert.deepEqual(found.map(item => item.value), ["red", "blue", "orange", "#111", "#111", "#222", "#222"]);
});

test("lines are one width in a line or state colour", () => {
    for (let [property, value] of [
        ["border", "var(--line-width) solid var(--line-rule)"], ["border-block-end", "var(--line-width) solid var(--line-popover)"],
        ["outline", "var(--focus-width) solid var(--focus-ring)"], ["outline", "var(--indicator-width) solid var(--accent)"],
        ["border", "0"], ["border", "none"], ["border", "var(--line-width) solid transparent"], ["border-color", "currentColor"],
        ["border-color", "var(--negative)"], ["border-inline-end-width", "var(--line-width)"], ["outline", "var(--line-width) solid Highlight"],
        ["border-style", "dashed"], ["border", "inherit"],
    ]) assert.deepEqual(rulesFor(property, value, "app/Test.svelte"), [], `${property}: ${value}`);
    for (let [property, value] of [
        ["border", "1px solid var(--line-rule)"], ["border-block-start", "var(--line-width) solid var(--border)"], ["outline", "2px solid var(--accent)"],
        ["border", "1.5px solid color-mix(in srgb, var(--text) 38%, transparent)"], ["border-width", "0 0 1.75px"], ["border-color", "var(--text)"],
        ["border", "var(--hairline) solid var(--line-rule)"], ["border", "var(--line-width, 1px) solid var(--line-rule)"], ["outline-width", "thin"],
    ]) assert.deepEqual(rulesFor(property, value, "app/Test.svelte"), ["line"], `${property}: ${value}`);
});

test("shadows with blur pass; a shadow without blur is a line", () => {
    for (let value of ["var(--shadow-overlay)", "0 4px 12px var(--scrim)", "none"]) assert.deepEqual(rulesFor("box-shadow", value, "app/Test.svelte"), [], value);
    for (let value of ["inset 0 0 0 1px var(--line-control)", "0 -1px 0 var(--line-rule)", "0 1px var(--line-rule)", "0 0 0 var(--line-width) var(--accent)"]) {
        assert.deepEqual(rulesFor("box-shadow", value, "app/Test.svelte"), ["line"], value);
    }
});

test("radii come from tokens", () => {
    for (let value of ["var(--radius-control)", "0", "50%", "var(--sheet-radius) var(--sheet-radius) 0 0", "var(--radius-pill)"]) assert.deepEqual(rulesFor("border-radius", value, "app/Test.svelte"), [], value);
    for (let value of ["4px", "999px", "var(--sheet-radius, 12px)", "1em"]) assert.deepEqual(rulesFor("border-radius", value, "app/Test.svelte"), ["radius"], value);
    assert.deepEqual(rulesFor("border-top-left-radius", "2px", "app/Test.svelte"), ["radius"]);
});

test("a thin pseudo-element strip with a background is a line, a sized helper is not", () => {
    let found = inspectSource("app/Test.svelte", component(`.a::after { content: ""; width: 1px; background: var(--line-rule); }
        .b::before { content: ""; height: var(--line-width); background-color: var(--accent); }
        .c::after { content: ""; width: 12px; height: 12px; background: var(--accent); }
        .sr-only { width: 1px; height: 1px; overflow: hidden; }`));
    assert.deepEqual(found.map(item => [item.rule, item.scope]), [["line", "CSS .a::after"], ["line", "CSS .b::before"]]);
});

test("line exceptions need a reason and cover one declaration", () => {
    let found = inspectSource("app/Test.svelte", component(`.tick::after {
      /* design-token-allow line: the tick is a glyph drawn with two borders */
      border-width: 0 0 1.75px 1.75px; border-color: var(--text);
    }`));
    assert.deepEqual(found.map(item => item.property), ["border-color"]);
});

test("script styles cannot draw lines outside the system", () => {
    let source = `let theme = { ".x": { borderTop: "1px solid var(--line-rule)", outline: "var(--line-width) solid var(--accent)", borderRadius: "4px" } };`;
    assert.deepEqual(inspectSource("app/Test.ts", source).map(item => [item.rule, item.property]), [["line", "border-top"], ["radius", "border-radius"]]);
});
