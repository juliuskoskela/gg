import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// everything resolves through tokens, so appearances and colour vision palettes apply without a rebuild.
// code text matches the diff viewer: its code stack, size and line height
export let editorTheme = EditorView.theme({
    "&": { height: "100%", backgroundColor: "var(--surface)", color: "var(--text)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { font: "var(--font-code)", overscrollBehavior: "contain", pointerEvents: "auto" },
    ".cm-content": { caretColor: "var(--text-strong)", pointerEvents: "auto" },
    ".cm-line": { pointerEvents: "auto" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text-strong)" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--selection-bg)" },
    ".cm-activeLine": { backgroundColor: "var(--hover)" },
    ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--faint)", border: "none" },
    ".cm-gutterElement": { pointerEvents: "auto" },
    ".cm-activeLineGutter": { backgroundColor: "var(--hover)", color: "var(--text)" },
    // inset from the tree's seam so the bar reads as a line marker, not as the pane's border
    ".cm-change-gutter": { width: "4px", marginInlineStart: "var(--space-1)" },
    ".cm-change-gutter .cm-gutterElement": { position: "relative", padding: "0" },
    ".cm-note-gutter .cm-gutterElement": { display: "flex", padding: "0" },
    ".cm-change": { position: "absolute", display: "block", insetInlineStart: "0", width: "2px" },
    ".cm-change-added": { top: "0", bottom: "0", backgroundColor: "var(--positive)" },
    ".cm-change-modified": { top: "0", bottom: "0", backgroundColor: "var(--lane-0)" },
    ".cm-change-deleted": { top: "-3px", width: "4px", height: "6px", backgroundColor: "var(--negative)", clipPath: "polygon(0 0, 100% 50%, 0 100%)" },
    ".cm-searchMatch": { backgroundColor: "var(--accent-subtle)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent-subtle)", outline: "1px solid var(--accent-border)" },
    ".cm-selectionMatch": { backgroundColor: "var(--accent-subtle)" },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--accent-subtle)", outline: "1px solid var(--accent-border)" },
    ".cm-panels": { backgroundColor: "var(--panel-header-bg)", color: "var(--text)", pointerEvents: "auto" },
    ".cm-panels.cm-panels-top": { borderTop: "1px solid var(--view-inner-rule)", borderBottom: "1px solid var(--view-inner-rule)" },
    ".cm-panel.cm-search": { font: "var(--font-label)" },
    ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { pointerEvents: "auto", font: "var(--font-label)" },
    ".cm-panel.cm-search [name=close]": { color: "var(--muted)" },
});

export let highlightStyle = HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.self, t.tagName], color: "var(--diffs-token-keyword)" },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.definition(t.propertyName), t.typeName, t.className, t.namespace, t.attributeName, t.macroName], color: "var(--diffs-token-function)" },
    { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.name), t.constant(t.variableName), t.unit, t.labelName], color: "var(--diffs-token-constant)" },
    { tag: [t.string, t.special(t.string), t.character, t.regexp, t.escape, t.inserted], color: "var(--diffs-token-string)" },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta, t.documentMeta], color: "var(--diffs-token-comment)" },
    { tag: [t.propertyName, t.variableName, t.name, t.definition(t.variableName)], color: "var(--diffs-token-parameter)" },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace, t.derefOperator], color: "var(--diffs-token-punctuation)" },
    { tag: [t.link, t.url], color: "var(--diffs-token-link)", textDecoration: "underline" },
    { tag: t.heading, color: "var(--diffs-token-keyword)", font: "var(--font-code-strong)" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strong, font: "var(--font-code-strong)" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: [t.deleted, t.invalid], color: "var(--diffs-token-deleted)" },
]);

export let syntaxTheme = syntaxHighlighting(highlightStyle);
