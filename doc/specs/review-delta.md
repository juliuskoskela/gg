# Changes between versions

`query_review_delta` compares two exact commits carrying the same jj change ID. The request contains `from`, `to`, an optional repository-relative `path`, and `full_context` (default false). It never resolves either endpoint to the current visible change, writes a commit, checks out an older operation, or changes the working copy.

The comparison uses `jj_lib::rewrite::rebase_to_dest_parent`, the same primitive used by `jj interdiff`. It applies the earlier version's patch (earlier parent tree → earlier commit tree) to the later version's merged parent tree, then compares that result to the later commit tree. Parent-only changes therefore cancel, including changed context in the same file. A raw diff of the two version trees would incorrectly include those changes.

The response is `Ready` with file hunks and both descriptions, or `Unavailable` with a reason. A missing retained commit, mismatched change IDs, or an unresolved conflict in either compared tree is not an empty review delta. Conflicts introduced when transplanting the earlier patch are explicitly unavailable: the UI asks the reviewer to inspect the versions separately. A path-filtered request checks conflicts within that file, so an unrelated conflicted file does not prevent a clean file comparison.

Descriptions are reported separately from file changes. A pure description rewrite can have no code delta and still show its changed explanation. Binary files and file metadata changes remain listed even when the text diff renderer has no preview. Renames are represented by the existing tree diff's delete/add semantics.

The Evolution panel allows selecting any two retained versions of the same change. Contributions from a different change cannot be compared as versions. The reviewed-mark entry point uses the exact recorded reviewed commit as `from`, the current exact commit as `to`, and the marked file path where applicable.

Regression coverage includes same-file parent context changes, author edits on a changed base, ambiguous overlapping rebases, absent and mismatched endpoints, description-only rewrites, file filtering and stale UI responses. Comparisons use three context lines by default and can request full context for the existing diff renderer.
