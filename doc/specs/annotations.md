# Annotations

Annotations are local notes attached to repository content: changes, bookmarks, files in a revision, or ranges of lines in a diff. One note can point at several of these places. They exist to capture observations while reading code and hand them to someone else, usually an LLM, with enough location for the reader to find the code.

Every annotation is the root of a thread. Its first post is the note; later posts are replies from people or agents. Notes are never added to the repository.

## Using them

- **Point at several places.** Select a range of revisions in the timeline (Shift+click or Shift+arrow) and choose *Annotate 2 changes…* to note them together. While a note or draft is open in the Annotations view, every annotate menu also offers *Add to …*, which points that note at the right-clicked place too. Each place shows as a chip on the note; hover a chip to remove it, as long as one remains.
- **Annotate.** Right-click a change or bookmark in the timeline, a file in the file tree, a hunk's actions, a line in the diff, or the change and commit ids in Description, and choose *Annotate…*. Select several lines first to annotate the range. The command palette offers *Annotate change…* for the selected revision. Annotating never touches history, so it works on immutable revisions too.
- **Write.** A new note opens as a draft in the Annotations view, not in a dialog, so you can keep browsing revisions, files and diffs while writing. The draft stays at the top of the list until it is saved or discarded, including across reloads. Starting another note while a draft has text asks first. Notes are markdown with a preview; Ctrl/⌘+Enter saves.
- **Review.** *Views → Annotations* lists notes, newest activity first. Clicking a note opens the places it points at, the annotated code for line notes and the thread beside the list; clicking it again, the close button or Escape closes it. Your own posts can be edited; notes can be replied to, resolved, reopened and deleted.
- **Copy.** Tick notes, or the check beside the count to select every listed note, and choose *Copy selected* to put markdown on the clipboard: each note's location (change and commit ids, path, lines, revision subject), the quoted code and the thread, plus one line explaining how to reply.
- **At a glance.** List rows show the first place a note points at, with a `+N` badge for the rest, a reply count, and a warning when something it points at has changed. Changes and files with open notes show a note marker in the timeline, the file tree and the diff footer; hovering previews the notes, clicking opens them.

## Agents and the command line

`gg annotations` (alias `gg notes`) reads and answers notes without opening the app. It finds the repository from the current directory, or from `-R <path>`.

```sh
gg annotations list [--all] [--json]
gg annotations show <note> [--json]
gg annotations export [<note>...]        # markdown, all open notes by default
gg annotations reply <note> [--agent <name>] [<text> | -]
gg annotations resolve <note>
gg annotations reopen <note>
```

A note id may be shortened to any unambiguous prefix. Replies read standard input when the text is `-` or omitted. Without `--agent`, the author is the jj user. The open Annotations view picks up replies within a few seconds.

## Anchors

A note has one or more targets. Each target is an anchor plus the revision's summary line at the time. Anchors store full ids and repository-relative paths, so they stay meaningful outside GG.

| Kind | Fields |
| --- | --- |
| `revision` | `change_id`, `commit_id` |
| `bookmark` | `name`, optional `remote`, `change_id`, `commit_id` |
| `file` | `change_id`, `commit_id`, `path` |
| `lines` | `change_id`, `commit_id`, `path`, `side` (`old` or `new`), `start`, `end`, `quote` |

Notes are written against an exact commit and are never moved silently. When the app lists notes it compares each anchor with the repository:

- **Current:** the annotated commit is still the change's version.
- **Rewritten:** the change has a newer commit. For line notes on the new side, GG also checks whether the quoted lines are still at the same place.
- **Missing:** the change no longer exists.

Rewritten and missing notes are marked *Outdated*, and the export says so.

## Storage

Notes are stored outside the repository, in GG's data directory:

```text
<data>/gg/repos/<repo key>/
  repo.json                          last known location, for people
  annotations/<id>/annotation.json   format, targets, author
  annotations/<id>/events/*.json     posts, edits, status changes and added or removed targets
```

`<data>` is `$XDG_DATA_HOME` (by default `~/.local/share`) on Linux and macOS, and `%APPDATA%` on Windows. `GG_DATA_DIR` overrides it.

The repository key is jj's per-repository id from `.jj/repo/config-id`. All workspaces of a repository share it, and it survives moving the repository. Repositories without one fall back to a hash of their location. GG doesn't write into `.jj/`: jj has no extension point for third-party data there, and jj 0.46 moved its own per-repository config out of `.jj/` for security.

Format version 2 stores a list of targets; version 1 notes, which pointed at one place, are read as notes with one target. Each event is a separate file, created atomically and never rewritten, so the app and the command line can write to the same thread at the same time. A damaged note is skipped rather than hiding the others.

## Safety

Note bodies may come from agents or other tools. Markdown is sanitized: no scripts, images, frames, styles or forms, and links keep only `http`, `https` and `mailto` targets and open in a new window. Paths must be relative and can't climb out of the repository.

## Boundaries

This is the core layer. A plugin could build forge reviews on it, for example syncing threads with Tangled or GitHub. The plugin would supply what only the forge knows, such as merges and remote comments. It would record that as events and relocations, never by editing notes directly. Review mode (PR #14) predates this layer; moving it onto these anchors and threads is follow-up work.

Not included yet: markers in the diff gutter, editing from the command line, and creating notes from the command line.
