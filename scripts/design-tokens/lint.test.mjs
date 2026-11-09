import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, inspectSource, rulesFor } from "./lint.mjs";

let component = css => `<div></div><style>${css}</style>`;

test("semantic roles and resets pass, including color mixing and geometry", () => {
    assert.deepEqual(inspectSource("app/Test.svelte", component(`
        div { font: var(--font-body); color: color-mix(in srgb, var(--negative) 20%, transparent);
          border: 1px solid var(--red); width: 16px; padding: 0; gap: var(--gap-row); margin-inline: auto; }
    `)), []);
});

test("rejects actual typography, colors and rhythm literals, not CSS comments or URLs", () => {
    let found = inspectSource("app/Test.svelte", component(`
      /* color: red; */
      div { font-size: var(--type-ui); line-height: 1.5; font-weight: 500; font: 13px sans-serif;
        color: red; background: url("red.svg#fff"); border: 1px solid #fff;
        box-shadow: 0 0 2px rgb(0 0 0 / 20%); padding: 0 12px; row-gap: 4px; }
    `));
    assert.deepEqual(found.map(item => item.rule), ["typography", "typography", "typography", "typography", "color", "color", "color", "spacing", "spacing"]);
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
    assert.deepEqual(found.map(item => item.value), ["red", "blue", "orange", "#111", "#222"]);
});
