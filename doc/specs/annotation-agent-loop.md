# Local agent handoff

Each thread has **Copy for agent**. It copies that thread's locations, full original
change and commit IDs, quoted code, replies and the CLI reply instruction. Split
owners are described separately; original anchors stay intact. The message confirms
**Copied for agent** only after the clipboard operation succeeds.

The action prepares text for the user's existing agent workflow. It does not launch
a shell or connect to an agent provider. Actual dispatch can be added by a configured
integration later.

## Reply attribution

The existing CLI remains compatible:

```sh
gg annotations reply NOTE --agent codex 'Updated the parser.'
gg annotations reply NOTE --agent codex --model gpt-example \
  --risk-level 3 --risk-explanation 'Changes authentication' 'Updated the parser.'
```

`--model` and `--risk-level` require `--agent`; `--risk-sha` and repeatable
`--risk-explanation` require a risk level. Agent names remain self-reported. Neither
attribution nor a risk score establishes authorship or verifies correctness.

Optional metadata belongs to the post event, separate from the author identity
used to authorize editing a post. Old events omit it. Body edits preserve it, and
annotation bundles preserve it through export/import.

Markdown export writes Linear's version 1 extension format with `onBehalfOf` and
`riskScore` plugins. Its documented constraints are: model up to 200 characters;
risk level integer 1–4; optional 40-character Git SHA; at most eight nonempty
explanations of up to 200 characters each. GG additionally limits agent names to
200 characters. A jj commit ID is not automatically used as a Git SHA.

Source: [Linear review extension documentation](https://linear.app/docs/diffs#review-platform).

## Reviewing the response

**Agent replied** means the latest post after the original note has agent attribution.
**Change rewritten** means at least one target's current version differs from its
original anchor. These facts are independent, and neither resolves the thread.

**Review changes** opens the current revision and file for a valid target. The existing
**Since review** action compares against the reviewer's stored baseline and excludes
parent-only rebase edits. Copying a note does not mark any code reviewed or replace
that baseline. Without a stored review, the ordinary diff remains available.

These labels do not claim that all intervening edits came from the agent. The local
handoff has no execution service from which to establish that causal relationship.
