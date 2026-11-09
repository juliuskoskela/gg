# Bundled plugin host

Issue: https://git.digimuoto.com/juliuskoskela/gg/issues/15

GG loads a build-time list of bundled plugins from `app/plugins/bundled.ts`.
The list is initially empty; review is the first consumer in #16. This is not
an external package loader, a scripting runtime, or a security sandbox for
untrusted code. Bundled code is reviewed and shipped with the application.

## Manifest and lifecycle

A plugin declares a stable lowercase ID, a display name, version, description,
API version (`1`), and explicit capabilities. Settings lists the bundled plugins
and their permissions. Plugins start disabled. The enabled IDs are a local user
preference; repository data remains separate.

Enabling a plugin with an open repository calls `activate(api)`. Its result may
contain views, commands, and a disposer. A repository change disposes the old
instance and starts a new instance. Context subscriptions report repository
status and the selected revision set without restarting on every selection.
Disabling a plugin unregisters its commands/views, closes its panels, removes
context subscriptions, and invokes its disposer. A late activation result is
disposed rather than registered. Results from old repository requests are
rejected rather than delivered to a new instance. Storage requests also carry
the originating workspace path; the backend rejects a request if its worker
has switched to a different workspace. Activation failures leave
core views running and appear in Settings. Rendering errors are contained in
the plugin panel with a retry action.

## Contributions

Views are Svelte components accepting `{ api }`. Their stable panel identifiers
are `plugin:<plugin-id>:<view-id>`. They use the existing dock, Views menu,
command palette, compact layout and panel lifecycle. View components can use
`ViewToolbar` like core views. Commands have namespaced identifiers and appear
in the command palette; `contextMenu: true` also adds them to context menus.
An optional availability callback receives the current operand. Contributions
are validated and become unavailable immediately when their owner stops.

## Capabilities

| Capability | Access |
| --- | --- |
| `queries.read` | Closed list of repository history/diff queries |
| `annotations.read` | Read local annotation threads |
| `reviews.read` | Read local reviewed marks and their current state |
| `storage` | Read, replace, list and delete the plugin's own local JSON values |
| `facts.publish` | Append local facts and notify core consumers |

The API exposes no mutation, trigger, annotation-write, terminal, or raw IPC
function. Read query names are checked at runtime as well as in TypeScript.
Capabilities are checked for each call, including after asynchronous completion.
This limits the host API, not arbitrary JavaScript: a malicious bundled component
would share the app's process and imports, so this is explicitly not an untrusted
plugin isolation mechanism.

## Storage and facts

`PluginStore` uses the same per-repository GG identity as annotations, below
`<GG data root>/repos/<repository key>/plugins/<plugin id>/`. It never writes to
`.jj/` or the working tree. Keys and fact kinds are single validated path
components, not paths. Values are JSON with a 4 MiB serialized limit, written
atomically via a temporary file. Missing values return null. Read and write
errors are propagated.

Facts are separate append-only JSON records with a backend timestamp and unique
ID. Publishing persists first, then emits `pluginFacts` in the frontend with the
repository identity. This stream reports newly published facts; it is not a
complete history. Core can read persisted facts through the local `plugin_data`
endpoint (`Facts`, exclusive cursor, up to 100 records). A plugin can later add
facts such as a completed review; core is not required to act on them.

Both desktop and web transports forward the same `PluginRequest` through the
workspace worker. Namespace isolation prevents accidental cross-plugin storage
access through the host. It does not grant an external authentication boundary
beyond the application's existing local transport.

## Validation

Host tests exercise permissions, enabled preference restoration, Settings,
view registration and opening in the dock, toolbar rendering, command cleanup,
selection updates, repository switching, stale asynchronous results and failures.
Rust tests cover atomic replacement, namespace isolation, path rejection, size
limits, stale workspace rejection and append-only fact cursors. Generated IPC types cover both transports.
