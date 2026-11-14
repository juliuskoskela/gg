import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parse } from "svelte/compiler";
import ts from "typescript";

let namedColors = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(" "));
let typography = new Set(["font-size", "font-weight", "line-height"]);
let spacing = /^(?:(?:row|column)-gap|gap|(?:margin|padding)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?)$/;
let inherited = /^(?:inherit|initial|unset|revert|revert-layer)$/;
// lines (doc/specs/lines.md): one width for every line, plus the focus ring and state marks
let lineWidths = new Set(["--line-width", "--focus-width", "--indicator-width"]);
// the four roles, then state marks that keep their meaning colour: drop targets and selection (accent), errors
// and warnings, keyboard focus (and the focused view's trace), a focused field and a hovered control outline
let lineColours = new Set(["--line-seam", "--line-rule", "--line-popover", "--line-control", "--accent", "--negative", "--warning", "--focus-ring", "--view-focus-ring", "--field-focus-border", "--control-hover"]);
let lineKeywords = /^(?:none|hidden|solid|dashed|transparent|currentcolor|inherit|initial|unset|revert|revert-layer|!important|highlight|canvastext|buttontext|graytext|linktext|selecteditem|selecteditemtext|mark|marktext|field|fieldtext|canvas|buttonborder|buttonface|accentcolor|accentcolortext|auto)$/i;
let lineProperty = /^(?:border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-(?:width|color|style))?|outline(?:-(?:width|color|style))?)$/;
let radiusProperty = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/;
let radiusTokens = /^--(?:radius-[\w-]+|view-radius|sheet-radius)$/;
let normalize = value => value.replace(/\s+/g, " ").trim();

// remove comments, quoted content and urls so text and asset names are not colors.
function visualValue(value) {
    return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi, " ");
}

export function rulesFor(property, value, file) {
    property = property.toLowerCase();
    let rules = [];
    let tokenDefinition = property.startsWith("--") && ["app/global.css", "app/display/palettes.css"].includes(file);
    let visible = visualValue(value).replace(/var\(\s*--[\w-]+/g, "var(");
    if (file !== "app/global.css" && (typography.has(property) || property === "font" && !/^(?:var\(--font-[\w-]+\)|inherit|initial|unset|revert|revert-layer)(?:\s*!important)?$/.test(normalize(value)))) {
        rules.push("typography");
    }
    if (!tokenDefinition && (/#(?:[\da-f]{3,8})\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(visible) || (visible.match(/\b[a-z]+\b/gi) ?? []).some(word => namedColors.has(word.toLowerCase())))) {
        rules.push("color");
    }
    // geometry (width, position, borders) is intentionally outside the spacing rhythm.
    if (spacing.test(property) && !inherited.test(normalize(value))) {
        // zero with a unit is still a reset, not an independent spacing decision.
        let dimensions = [...visible.matchAll(/(?:^|[^\w-])([-+]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(?:[a-z]+|%)(?=$|[^\w])/gi)];
        if (dimensions.some(match => Number(match[1]) !== 0) || /^[-+]?(?:\d*\.)?\d+$/.test(visible.trim()) && Number(visible) !== 0) rules.push("spacing");
    }
    if (lineProperty.test(property) && !inherited.test(normalize(value)) && !lineAllowed(property, visualValue(value))) rules.push("line");
    if (property === "box-shadow" && shadowLine(visualValue(value))) rules.push("line");
    if (radiusProperty.test(property) && !inherited.test(normalize(value)) && !radiusAllowed(visualValue(value))) rules.push("radius");
    return rules;
}

// top-level words of a value, with each var() or function kept whole
function words(value) {
    let result = [], depth = 0, current = "";
    for (let character of value) {
        if (character === "(") depth++;
        if (character === ")") depth--;
        if (/\s/.test(character) && depth === 0) { if (current) result.push(current); current = ""; }
        else current += character;
    }
    if (current) result.push(current);
    return result;
}

function variable(word) {
    // a fallback inside the var() is still a literal, so only a bare reference names a token
    return word.match(/^var\(\s*(--[\w-]+)\s*\)$/)?.[1] ?? null;
}

function lineAllowed(property, value) {
    for (let word of words(value.trim())) {
        if (lineKeywords.test(word)) continue;
        if (/^[-+]?0(?:\.0+)?(?:[a-z]+)?$/i.test(word)) continue;
        let name = variable(word);
        if (!name) return false;
        let width = /-width$/.test(property), colour = /-color$/.test(property);
        if (width ? !lineWidths.has(name) : colour ? !lineColours.has(name) : !lineWidths.has(name) && !lineColours.has(name)) return false;
    }
    return true;
}

// a shadow with no blur and a spread or offset draws a line, and a line must be a border to snap with the others
function shadowLine(value) {
    for (let shadow of value.split(/,(?![^(]*\))/)) {
        let lengths = words(shadow.trim()).filter(word => /^[-+]?(?:\d*\.)?\d+(?:[a-z]+)?$/i.test(word) || /^var\(--(?:hairline|line-width|focus-width|indicator-width)\)$/.test(word));
        let number = word => word.startsWith("var(") ? 1 : parseFloat(word);
        if (lengths.length >= 2 && (lengths.length < 3 || number(lengths[2]) === 0) && lengths.some((word, index) => index !== 2 && number(word) !== 0)) return true;
    }
    return false;
}

function radiusAllowed(value) {
    return words(value.trim().replace(/\s*\/\s*/g, " ")).every(word => /^[-+]?0(?:[a-z]+|%)?$/i.test(word) || word === "50%" || radiusTokens.test(variable(word) ?? ""));
}

function combinations(parts) {
    return [...new Set(parts.reduce((prefixes, alternatives) => prefixes.flatMap(prefix => alternatives.map(value => prefix + value)), [""]))];
}

function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (let child of node) walk(child, visit); return; }
    visit(node);
    for (let [key, child] of Object.entries(node)) if (!["parent", "loc", "metadata"].includes(key)) walk(child, visit);
}

export function inspectSource(file, source) {
    let violations = [];
    function declaration(property, value, scope, offset, preceding = "") {
        let allow = preceding.match(/\/\*\s*design-token-allow\s+(typography|color|spacing|line|radius):\s*([^*]+)\*\/\s*$/);
        if (allow && allow[2].trim().length < 16) throw new Error(`${file}: exception needs a specific reason`);
        for (let rule of rulesFor(property, value, file)) {
            if (allow?.[1] === rule) continue;
            violations.push({ file, rule, scope: normalize(scope), property, value: normalize(value), line: source.slice(0, offset).split("\n").length });
        }
    }
    function css(text, scope, offset = 0, declarationsOnly = false) {
        let prefix = declarationsOnly ? "<style>x{" : "<style>";
        let tree;
        try { tree = parse(prefix + text + (declarationsOnly ? "}" : "") + "</style>", { modern: true }).css; }
        catch (error) { throw new Error(`${file}: cannot inspect ${scope}: ${error.message}`); }
        function visit(node, context) {
            if (node.type === "Rule") context += " " + text.slice(node.prelude.start - prefix.length, node.prelude.end - prefix.length);
            if (node.type === "Atrule") context += ` @${node.name} ${node.prelude ?? ""}`;
            if (node.type === "Rule" && /::?(?:before|after)\b/.test(node.prelude ? text.slice(node.prelude.start - prefix.length, node.prelude.end - prefix.length) : "")) thinStrip(node, context);
            if (node.type === "Declaration") {
                let start = node.start - prefix.length;
                declaration(node.property, node.value, context, offset + Math.max(0, start), text.slice(0, start));
            }
            for (let child of node.children ?? node.block?.children ?? []) visit(child, context);
        }
        // a pseudo-element painted as a thin strip is a line that won't snap like a border
        function thinStrip(rule, context) {
            let declarations = (rule.block?.children ?? []).filter(child => child.type === "Declaration");
            let thin = declarations.some(child => /^(?:width|height|inline-size|block-size)$/.test(child.property) && /^(?:(?:0?\.\d+|[12])px|var\(--(?:hairline|line-width|indicator-width)\))$/.test(normalize(child.value)));
            let paint = declarations.find(child => /^background(?:-color)?$/.test(child.property) && !/^(?:none|transparent|0)$/.test(normalize(child.value)));
            if (!thin || !paint) return;
            let start = paint.start - prefix.length;
            let allow = text.slice(0, start).match(/\/\*\s*design-token-allow\s+line:\s*([^*]+)\*\/\s*$/);
            if (allow && allow[1].trim().length < 16) throw new Error(`${file}: exception needs a specific reason`);
            if (allow) return;
            violations.push({ file, rule: "line", scope: normalize(context), property: paint.property, value: normalize(paint.value), line: source.slice(0, offset + Math.max(0, start)).split("\n").length });
        }
        visit(tree, scope);
    }
    function scripts(text, offset = 0) {
        let tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        function literal(node) {
            if (!node) return null;
            if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
            if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => (literal(span.expression) ?? "__dynamic__") + span.literal.text).join("");
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return (literal(node.left) ?? "__dynamic__") + (literal(node.right) ?? "__dynamic__");
            if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator)) return (node.operator === ts.SyntaxKind.MinusToken ? "-" : "+") + (literal(node.operand) ?? "__dynamic__");
            return null;
        }
        function alternatives(node) {
            if (!node) return ["__dynamic__"];
            if (ts.isParenthesizedExpression(node)) return alternatives(node.expression);
            if (ts.isConditionalExpression(node)) return [...alternatives(node.whenTrue), ...alternatives(node.whenFalse)];
            if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return [...alternatives(node.left), ...alternatives(node.right)];
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return combinations([alternatives(node.left), alternatives(node.right)]);
            if (ts.isTemplateExpression(node)) return combinations([[node.head.text], ...node.templateSpans.flatMap(span => [alternatives(span.expression), [span.literal.text]])]);
            return [literal(node) ?? "__dynamic__"];
        }
        function visit(node) {
            let value = literal(node);
            if (value !== null && (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) && /(?:^|[;{])\s*(?:--[\w-]+|font(?:-[a-z-]+)?|line-height|color|background(?:-[a-z-]+)?|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?|fill|stroke|(?:row-|column-)?gap|(?:margin|padding)(?:-[a-z-]+)?)\s*:\s*\S/.test(value)) {
                css(value, "script CSS", offset + node.getStart(tree), !value.includes("{"));
            }
            if (ts.isPropertyAssignment(node)) {
                let name = node.name.getText(tree).replace(/^["']|["']$/g, "");
                let property = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                if (typography.has(property) || spacing.test(property) || /^(?:color|background(?:-color)?|border(?:-[a-z-]+)?|outline(?:-[a-z]+)?|font|fill|stroke|box-shadow)$/.test(property)) {
                    for (let assigned of new Set(alternatives(node.initializer))) declaration(property, assigned, "script object", offset + node.getStart(tree), text.slice(0, node.getStart(tree)));
                }
            }
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))) {
                let name = ts.isPropertyAccessExpression(node.left) ? node.left.name.text : literal(node.left.argumentExpression);
                let property = (name ?? "").replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                let target = node.left.expression.getText(tree);
                if (/\.style$/.test(target) || ["font", "fill-style", "stroke-style"].includes(property)) {
                    for (let assigned of new Set(alternatives(node.right))) {
                        if (property !== "css-text") declaration(property, assigned, "script style", offset + node.getStart(tree), text.slice(0, node.getStart(tree)));
                        else if (ts.isBinaryExpression(node.right)) css(assigned, "script CSS", offset + node.getStart(tree), true);
                    }
                }
            }
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "setProperty" && /\.style$/.test(node.expression.expression.getText(tree))) {
                let property = literal(node.arguments[0]);
                if (property !== null) for (let value of new Set(alternatives(node.arguments[1]))) declaration(property, value, "script style", offset + node.getStart(tree), text.slice(0, node.getStart(tree)));
            }
            ts.forEachChild(node, visit);
        }
        visit(tree);
    }
    if (file.endsWith(".css")) css(source, "CSS");
    else if (/\.(?:ts|js|mjs)$/.test(file)) scripts(source);
    else if (file.endsWith(".svelte")) {
        let tree = parse(source, { modern: true });
        if (tree.css) css(tree.css.content.styles, "CSS", tree.css.content.start);
        for (let script of [tree.instance, tree.module]) if (script) scripts(source.slice(script.content.start, script.content.end), script.content.start);
        function templatePart(part) {
            if (part?.type === "Text") return [part.data];
            if (part?.type === "ExpressionTag") return expression(part.expression);
            return ["__dynamic__"];
        }
        function expression(node) {
            if (node?.type === "Literal") return [String(node.value)];
            if (node?.type === "ConditionalExpression") return [...expression(node.consequent), ...expression(node.alternate)];
            if (node?.type === "LogicalExpression") return [...expression(node.left), ...expression(node.right)];
            if (node?.type === "TemplateLiteral") return combinations(node.quasis.flatMap((part, index) => [[part.value.cooked], ...(node.expressions[index] ? [expression(node.expressions[index])] : [])]));
            if (node?.type === "BinaryExpression" && node.operator === "+") return combinations([expression(node.left), expression(node.right)]);
            return ["__dynamic__"];
        }
        walk(tree.fragment, node => {
            if (node.type === "Attribute" && node.name === "style") {
                for (let text of combinations((Array.isArray(node.value) ? node.value : [node.value]).map(templatePart))) {
                    if (text.includes(":")) css(text, "inline style", node.start, true);
                }
            }
            if (node.type === "StyleDirective") {
                let parts = Array.isArray(node.value) ? node.value : [node.value];
                for (let value of combinations(parts.map(templatePart))) declaration(node.name, value, "style directive", node.start);
            }
        });
    }
    return violations;
}

export function collect(root) {
    let files = [];
    function visit(directory) {
        for (let entry of readdirSync(directory, { withFileTypes: true })) {
            let path = resolve(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (/\.(svelte|css|ts|js|mjs)$/.test(entry.name) && !/\.(test|spec|d)\.(?:ts|js|mjs)$/.test(entry.name)) files.push(path);
        }
    }
    visit(resolve(root, "app"));
    return files.sort().flatMap(path => inspectSource(relative(root, path).replaceAll("\\", "/"), readFileSync(path, "utf8")));
}

export function identity(violation) {
    return JSON.stringify([violation.file, violation.rule, violation.scope, violation.property, violation.value]);
}

export function compare(violations, baseline) {
    let remaining = new Map(baseline.map(({ count, ...entry }) => [identity(entry), count]));
    let added = [];
    for (let violation of violations) {
        let key = identity(violation), count = remaining.get(key) ?? 0;
        if (count > 0) remaining.set(key, count - 1);
        else added.push(violation);
    }
    let stale = [...remaining].filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }));
    return { added, stale };
}
