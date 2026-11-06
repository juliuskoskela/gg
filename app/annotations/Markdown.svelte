<script lang="ts">
    import { marked } from "marked";
    import DOMPurify from "dompurify";
    export let source: string;

    // notes can come from agents and other tools, so render nothing that runs or loads
    let purify = DOMPurify();
    purify.addHook("afterSanitizeAttributes", node => {
        if (node.tagName === "A") {
            let href = node.getAttribute("href") ?? "";
            if (!/^(https?:|mailto:|#)/i.test(href)) node.removeAttribute("href");
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
    $: html = purify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: true }) as string, {
        FORBID_TAGS: ["img", "style", "iframe", "form", "input", "video", "audio", "svg", "math"],
        FORBID_ATTR: ["style"],
    });
</script>

<div class="markdown">{@html html}</div>

<style>
    .markdown { max-width: var(--prose-measure); min-width: 0; overflow-wrap: anywhere; color: var(--text); font: var(--font-prose); }
    .markdown :global(:first-child) { margin-block-start: 0; }
    .markdown :global(:last-child) { margin-block-end: 0; }
    .markdown :global(p), .markdown :global(ul), .markdown :global(ol), .markdown :global(pre), .markdown :global(blockquote) { margin-block: 0 .7em; }
    .markdown :global(h1), .markdown :global(h2), .markdown :global(h3), .markdown :global(h4) { margin-block: 1em .4em; color: var(--text-strong); font: var(--weight-strong) var(--type-body)/var(--leading-prose) var(--stack-ui); }
    .markdown :global(ul), .markdown :global(ol) { padding-inline-start: 1.4em; }
    .markdown :global(code) { padding: .1em .3em; border-radius: var(--radius-sm); background: var(--diff-buffer); font: var(--type-code)/1.5 var(--stack-code); font-variant-ligatures: none; }
    .markdown :global(pre) { overflow-x: auto; padding: 8px 10px; border-radius: var(--radius-control); background: var(--diff-buffer); }
    .markdown :global(pre code) { padding: 0; background: none; }
    .markdown :global(blockquote) { padding-inline-start: 10px; border-inline-start: 2px solid var(--rule); color: var(--muted); }
    .markdown :global(a) { color: inherit; text-decoration: underline; text-decoration-color: var(--muted); text-underline-offset: 2px; }
    .markdown :global(hr) { border: 0; border-block-start: 1px solid var(--rule); }
    .markdown :global(table) { border-collapse: collapse; }
    .markdown :global(th), .markdown :global(td) { padding: 2px 8px; border: 1px solid var(--rule); }
</style>
