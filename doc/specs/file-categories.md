# Review file categories

GG reads `.gitattributes` from the displayed revision's tree. The current checkout, Git index, `info/attributes`, global attributes and system attributes do not affect historical categories. No files are written to the repository. Deleted paths use the displayed final tree's attributes as well.

Attribute evaluation uses the existing `gix` Git attribute parser and matcher, including nested precedence, per-attribute overrides, quoting, `**`, root macros, and `!attribute` resets. Symlink and conflicted `.gitattributes` files are ignored. Invalid lines follow the parser's lenient Git-compatible handling.

| Category | Attribute |
| --- | --- |
| Implementation | `review-implementation` |
| Tests | `review-test` |
| Documentation | `review-documentation` |
| Generated | `review-generated` |
| Agent guidance | `review-agent-guidance` |
| Localization | `review-localization` |
| Assets | `review-assets` |

Bare attributes and `=true` enable a category; `-attribute`, `=false`, `!attribute`, and other string values do not. `linguist-generated` and `linguist-documentation` are fallback aliases, after explicit review categories. Unclassified files are implementation.

If several categories remain enabled, GG uses this fixed order: explicit implementation, generated, agent guidance, test, documentation, localization, assets, then Linguist generated and documentation. This resolves overlapping rules predictably; use negative assignments to remove a broader category before adding a narrower one.

```gitattributes
src/** review-implementation
spec/** review-test
docs/** review-documentation
vendor/** review-generated
AGENTS.md review-agent-guidance
```

The Files toolbar offers **Group by type**. All files stay available and selectable, including revisions containing only tests or generated files. Small trees display category headings; virtualized large lists keep fixed-height rows sorted by category. Non-implementation rows carry a quiet category label.

The Changes toolbar and visible timeline rows display implementation additions/deletions. An asterisk means other categories contribute to the full totals shown in the tooltip and accessible label. A generated-only change therefore shows `+0 −0*` while its generated files remain visible.

Timeline counts are loaded after a visible row settles, with at most two requests in flight and a bounded cache keyed by repository and exact commit. Queued reads are cancelled when their last visible consumer leaves; shared in-flight reads remain available to other consumers. They do not add file-content reads to the initial graph query. The existing revision-summary limit applies: over 400 changed files, binary files, or unresolved conflicts do not produce an exact count, so the timeline omits it and the Changes toolbar shows an unavailable count rather than a partial total.

References: [Git attributes](https://git-scm.com/docs/gitattributes), [review implementation plan](https://git.digimuoto.com/juliuskoskela/gg/src/branch/candidate/review-mode/doc/specs/review-plan.md).
