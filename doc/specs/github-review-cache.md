# Public GitHub cache foundation

This implements the first, read-only slice of [issue #18](https://git.digimuoto.com/juliuskoskela/gg/issues/18).
Enable the optional Public GitHub plugin, configure one public owner/repository,
and explicitly allow reads. Enabling the plugin alone makes no network request.
An optional GitHub login filters requested reviewers; it is not inferred from jj
identity and does not authenticate anyone.

## Boundary

The host exposes `github.read`, a separate visible permission. Its core broker
accepts only list-open-pulls pages 1–3 and individual positive pull numbers at
`https://api.github.com`. It uses GET only, fixed headers, no credentials, no
cookies, no request bodies and no redirects. Request names and cache validators
are bounded and validated before any request. Responses are limited to 5 MiB,
normalized to the public fields the view needs, and never contain comment bodies.
The process serializes requests and limits itself to 55 attempts per hour.
This does not reserve the shared-IP GitHub quota against other applications.

The broker runs asynchronously outside the jj worker. A slow network cannot
block repository queries or mutations. This is a reviewed bundled-code API,
not a security sandbox against arbitrary JavaScript loaded into the webview.

## Cache and mapping

Opening the view reads its local cache without waiting for the network. When
consented, serial refresh runs every 15 minutes, up to three list pages and two
mapped pulls missing from the open list. HTTP ETags retain unchanged pages.
Retry-After and rate-limit reset times delay further requests; failures retain
last successful data. The view labels cache age, paused reads and partial lists.
A missing pull is not assumed closed or merged: mapped pulls are read individually.

Mappings are explicit: select local changes containing the exact cached remote
head commit, then map that selection. Store the numeric remote repository identity
as a string, pull number, head SHA and exact local change/commit IDs. Rewrites,
missing commits and a changed remote head invalidate verification; names and
subjects never establish identity. A mapping is evidence about cached versions,
not an approval. Normal fetch/push remains in GG's repository controls.

Changed states of mapped pulls produce timestamped `github-pull-state` facts.
They do not alter repository state, personal reviewed marks, or local verdicts.
Configuration, cache and mappings use this plugin's existing per-repository data
namespace. No credentials are accepted or persisted.

## Remaining issue #18 work

This foundation does **not** implement two-way comments, authentication/private
repositories, importing review requests into Review sessions, remote verdicts,
remote stack discovery or tangled.org. It has a separate cached public queue.
Before adding authenticated writes, introduce scoped OS-backed credential storage,
remote comment/event identity and conflict/loop handling, conservative exact-line
mapping, and explicit publishing authorization. Agent metadata from #17 must
round-trip without turning imported remote identities into trusted local users.

Validation uses fixtures and intercepted local transport only. No GitHub requests
are made by tests. GitHub's [pull API](https://docs.github.com/en/rest/pulls/pulls),
[rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
and [cache/backoff guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
are the upstream protocol references.
