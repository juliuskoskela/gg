//! Local, untracked storage for annotations.
//!
//! Notes live in GG's data directory, not in the repository or in `.jj/`:
//! jj keeps third-party and security-sensitive data out of `.jj/` (its own
//! per-repo config moved to the user config directory in 0.46). Like jj, we
//! identify the repository by the random id in `.jj/repo/config-id`, which
//! all workspaces share and which survives moving the repository.
//!
//! ```text
//! <data>/gg/repos/<repo key>/
//!   repo.json                          last known location, for people
//!   annotations/<id>/annotation.json   immutable header: anchor, author
//!   annotations/<id>/events/*.json     posts, edits and status changes
//! ```
//!
//! Each event is its own file, created atomically and never rewritten, so the
//! app and the command line can add to the same thread concurrently.

pub mod cli;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;

use crate::messages::annotations::{
    ANNOTATION_FORMAT, ANNOTATION_VERSION, AnchorState, AnnotationAnchor, AnnotationAuthor,
    AnnotationPost, AnnotationStatus, AnnotationTarget, AnnotationThread, AuthorKind, LineSide,
    TargetInput,
};

const MAX_BODY: usize = 100_000;
const MAX_TARGETS: usize = 500;
const MAX_QUOTE: usize = 20_000;

#[derive(Serialize, Deserialize, Debug)]
struct Header {
    format: String,
    version: u32,
    id: String,
    created_at: DateTime<Utc>,
    author: AnnotationAuthor,
    #[serde(default)]
    targets: Vec<TargetInput>,
    // version 1 pointed at a single place
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anchor: Option<AnnotationAnchor>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    subject: String,
    #[serde(default)]
    workspace: String,
}

impl Header {
    fn initial_targets(&self) -> Vec<TargetInput> {
        let mut targets = self.targets.clone();
        if let Some(anchor) = &self.anchor {
            targets.insert(
                0,
                TargetInput {
                    anchor: anchor.clone(),
                    subject: self.subject.clone(),
                },
            );
        }
        targets
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct Event {
    id: String,
    at: DateTime<Utc>,
    author: AnnotationAuthor,
    #[serde(flatten)]
    kind: EventKind,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum EventKind {
    Post { body: String },
    Edit { post: String, body: String },
    Status { status: AnnotationStatus },
    AddTargets { targets: Vec<TargetInput> },
    RemoveTarget { anchor: AnnotationAnchor },
}

#[derive(Serialize)]
struct RepoInfo<'a> {
    workspace_root: &'a Path,
    repo_path: &'a Path,
}

pub struct AnnotationStore {
    dir: PathBuf,
}

/// `GG_DATA_DIR` overrides the platform data directory, for tests and
/// portable setups.
pub fn data_root() -> Result<PathBuf> {
    if let Some(dir) = std::env::var_os("GG_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    use etcetera::BaseStrategy;
    let strategy = etcetera::choose_base_strategy().context("Couldn't find a data directory")?;
    Ok(strategy.data_dir().join("gg"))
}

/// Finds the repository directory for a workspace root; secondary workspaces
/// store a pointer to it in `.jj/repo`.
pub fn repo_path_for_workspace(workspace_root: &Path) -> Result<PathBuf> {
    let dot_jj = workspace_root.join(".jj");
    let repo = dot_jj.join("repo");
    if repo.is_file() {
        let target =
            fs::read_to_string(&repo).with_context(|| format!("Reading {}", repo.display()))?;
        Ok(dot_jj.join(target.trim()))
    } else if repo.is_dir() {
        Ok(repo)
    } else {
        bail!("{} is not a jj workspace", workspace_root.display())
    }
}

/// Stable id for a repository: jj's config id when it has one, otherwise a
/// hash of its location.
pub fn repo_key(repo_path: &Path) -> String {
    if let Ok(id) = fs::read_to_string(repo_path.join("config-id")) {
        let id = id.trim();
        if !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_hexdigit()) {
            return id.to_ascii_lowercase();
        }
    }
    let path = dunce::canonicalize(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
    // fnv-1a: unlike DefaultHasher, stable across Rust releases
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.to_string_lossy().bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("path-{hash:016x}")
}

impl AnnotationStore {
    pub fn for_repo(repo_path: &Path, workspace_root: &Path) -> Result<Self> {
        let dir = data_root()?.join("repos").join(repo_key(repo_path));
        let store = AnnotationStore { dir };
        store.remember_location(repo_path, workspace_root);
        Ok(store)
    }

    pub fn for_workspace(workspace_root: &Path) -> Result<Self> {
        let repo_path = repo_path_for_workspace(workspace_root)?;
        Self::for_repo(&repo_path, workspace_root)
    }

    /// Opens a store in an explicit directory.
    pub fn at(dir: PathBuf) -> Self {
        AnnotationStore { dir }
    }

    pub fn location(&self) -> &Path {
        &self.dir
    }

    fn annotations_dir(&self) -> PathBuf {
        self.dir.join("annotations")
    }

    // best effort: the notes work without it
    fn remember_location(&self, repo_path: &Path, workspace_root: &Path) {
        let info = RepoInfo {
            workspace_root,
            repo_path,
        };
        if let Ok(json) = serde_json::to_vec_pretty(&info) {
            let path = self.dir.join("repo.json");
            if fs::read(&path).ok().as_deref() != Some(json.as_slice()) {
                let _ = fs::create_dir_all(&self.dir)
                    .and_then(|_| write_atomic(&path, &json, true).map_err(std::io::Error::other));
            }
        }
    }

    pub fn list(&self) -> Result<Vec<AnnotationThread>> {
        let dir = self.annotations_dir();
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(err) => return Err(err).with_context(|| format!("Reading {}", dir.display())),
        };
        let mut threads = Vec::new();
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            match self.read_thread(&entry.path()) {
                Ok(thread) => threads.push(thread),
                // one damaged note shouldn't hide the others
                Err(err) => log::warn!("skipping annotation {}: {err:#}", entry.path().display()),
            }
        }
        threads.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(threads)
    }

    /// Accepts a full id or an unambiguous prefix.
    pub fn resolve_id(&self, id: &str) -> Result<String> {
        let id = id.trim();
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
            bail!("Invalid annotation id: {id:?}");
        }
        if self.annotations_dir().join(id).is_dir() {
            return Ok(id.to_owned());
        }
        let matches: Vec<String> = fs::read_dir(self.annotations_dir())
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| name.starts_with(id))
            .collect();
        match matches.as_slice() {
            [single] => Ok(single.clone()),
            [] => Err(anyhow!("No annotation with id {id}")),
            _ => Err(anyhow!("Annotation id {id} is ambiguous")),
        }
    }

    pub fn get(&self, id: &str) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        self.read_thread(&self.annotations_dir().join(id))
    }

    pub fn create(
        &self,
        targets: Vec<TargetInput>,
        workspace: &str,
        author: AnnotationAuthor,
        body: &str,
    ) -> Result<AnnotationThread> {
        let targets = validate_targets(targets, &[])?;
        if targets.is_empty() {
            bail!("A note needs something to point at.");
        }
        let body = validate_body(body)?;
        let id = uuid::Uuid::new_v4().simple().to_string();
        let dir = self.annotations_dir().join(&id);
        let events = dir.join("events");
        fs::create_dir_all(&events).with_context(|| format!("Creating {}", events.display()))?;
        let now = Utc::now();
        let header = Header {
            format: ANNOTATION_FORMAT.to_owned(),
            version: ANNOTATION_VERSION,
            id: id.clone(),
            created_at: now,
            author: author.clone(),
            targets,
            anchor: None,
            subject: String::new(),
            workspace: workspace.to_owned(),
        };
        write_atomic(
            &dir.join("annotation.json"),
            &serde_json::to_vec_pretty(&header)?,
            false,
        )?;
        self.append(&id, author, EventKind::Post { body })?;
        self.get(&id)
    }

    pub fn reply(
        &self,
        id: &str,
        author: AnnotationAuthor,
        body: &str,
    ) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        let body = validate_body(body)?;
        self.append(&id, author, EventKind::Post { body })?;
        self.get(&id)
    }

    pub fn add_targets(
        &self,
        id: &str,
        author: AnnotationAuthor,
        targets: Vec<TargetInput>,
    ) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        let existing: Vec<AnnotationAnchor> = self
            .get(&id)?
            .targets
            .into_iter()
            .map(|target| target.anchor)
            .collect();
        let targets = validate_targets(targets, &existing)?;
        if !targets.is_empty() {
            if existing.len() + targets.len() > MAX_TARGETS {
                bail!("A note can point at most at {MAX_TARGETS} places.");
            }
            self.append(&id, author, EventKind::AddTargets { targets })?;
        }
        self.get(&id)
    }

    pub fn remove_target(
        &self,
        id: &str,
        author: AnnotationAuthor,
        anchor: AnnotationAnchor,
    ) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        let thread = self.get(&id)?;
        if !thread.targets.iter().any(|target| target.anchor == anchor) {
            bail!("The note doesn't point there.");
        }
        if thread.targets.len() == 1 {
            bail!("A note needs something to point at. Delete the note instead.");
        }
        self.append(&id, author, EventKind::RemoveTarget { anchor })?;
        self.get(&id)
    }

    pub fn edit(
        &self,
        id: &str,
        post: &str,
        author: AnnotationAuthor,
        body: &str,
    ) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        let thread = self.get(&id)?;
        let original = thread
            .posts
            .iter()
            .find(|candidate| candidate.id == post)
            .ok_or_else(|| anyhow!("No post {post} in annotation {id}"))?;
        if original.author != author {
            bail!("Only {} can edit this post", original.author.name);
        }
        let body = validate_body(body)?;
        self.append(
            &id,
            author,
            EventKind::Edit {
                post: post.to_owned(),
                body,
            },
        )?;
        self.get(&id)
    }

    pub fn set_status(
        &self,
        id: &str,
        author: AnnotationAuthor,
        status: AnnotationStatus,
    ) -> Result<AnnotationThread> {
        let id = self.resolve_id(id)?;
        if self.get(&id)?.status != status {
            self.append(&id, author, EventKind::Status { status })?;
        }
        self.get(&id)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let id = self.resolve_id(id)?;
        let dir = self.annotations_dir().join(&id);
        fs::remove_dir_all(&dir).with_context(|| format!("Deleting {}", dir.display()))
    }

    fn append(&self, id: &str, author: AnnotationAuthor, kind: EventKind) -> Result<()> {
        let event = Event {
            id: uuid::Uuid::new_v4().simple().to_string(),
            at: Utc::now(),
            author,
            kind,
        };
        let events = self.annotations_dir().join(id).join("events");
        fs::create_dir_all(&events)?;
        // sortable names make the directory readable by people, but order comes from content
        let name = format!(
            "{}-{}.json",
            event.at.format("%Y%m%dT%H%M%S%.9fZ"),
            &event.id[..8]
        );
        write_atomic(
            &events.join(name),
            &serde_json::to_vec_pretty(&event)?,
            false,
        )
    }

    fn read_thread(&self, dir: &Path) -> Result<AnnotationThread> {
        let header_path = dir.join("annotation.json");
        let header: Header = serde_json::from_slice(
            &fs::read(&header_path)
                .with_context(|| format!("Reading {}", header_path.display()))?,
        )
        .with_context(|| format!("Parsing {}", header_path.display()))?;
        if header.format != ANNOTATION_FORMAT || header.version > ANNOTATION_VERSION {
            bail!("unsupported format {} v{}", header.format, header.version);
        }
        if dir.file_name().and_then(|name| name.to_str()) != Some(header.id.as_str()) {
            bail!("id doesn't match its directory");
        }

        let mut events = Vec::new();
        if let Ok(entries) = fs::read_dir(dir.join("events")) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                    continue;
                }
                match fs::read(&path)
                    .map_err(anyhow::Error::from)
                    .and_then(|bytes| Ok(serde_json::from_slice::<Event>(&bytes)?))
                {
                    Ok(event) => events.push(event),
                    Err(err) => log::warn!("skipping event {}: {err:#}", path.display()),
                }
            }
        }
        events.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.id.cmp(&b.id)));

        let mut targets = header.initial_targets();
        let mut posts: Vec<AnnotationPost> = Vec::new();
        let mut status = AnnotationStatus::Open;
        let mut updated_at = header.created_at;
        for event in events {
            updated_at = updated_at.max(event.at);
            match event.kind {
                EventKind::Post { body } => posts.push(AnnotationPost {
                    id: event.id,
                    author: event.author,
                    created_at: event.at,
                    edited_at: None,
                    body,
                }),
                EventKind::Edit { post, body } => {
                    if let Some(target) = posts
                        .iter_mut()
                        .find(|candidate| candidate.id == post && candidate.author == event.author)
                    {
                        target.body = body;
                        target.edited_at = Some(event.at);
                    }
                }
                EventKind::Status { status: next } => status = next,
                EventKind::AddTargets { targets: added } => {
                    for target in added {
                        if !targets
                            .iter()
                            .any(|existing| existing.anchor == target.anchor)
                        {
                            targets.push(target);
                        }
                    }
                }
                EventKind::RemoveTarget { anchor } => {
                    if targets.len() > 1 {
                        targets.retain(|target| target.anchor != anchor);
                    }
                }
            }
        }
        if posts.is_empty() {
            bail!("annotation has no note");
        }

        if targets.is_empty() {
            bail!("annotation points nowhere");
        }
        Ok(AnnotationThread {
            id: header.id,
            targets: targets
                .into_iter()
                .map(|target| AnnotationTarget {
                    anchor: target.anchor,
                    subject: target.subject,
                    state: AnchorState::Unknown,
                })
                .collect(),
            workspace: header.workspace,
            created_at: header.created_at,
            updated_at,
            status,
            posts,
        })
    }
}

fn write_atomic(path: &Path, content: &[u8], replace: bool) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("{} has no parent", path.display()))?;
    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(content)?;
    temp.as_file().sync_all()?;
    if replace {
        temp.persist(path)?;
    } else {
        temp.persist_noclobber(path)?;
    }
    Ok(())
}

fn validate_body(body: &str) -> Result<String> {
    let body = body.trim_end();
    if body.trim().is_empty() {
        bail!("Write something before saving.");
    }
    if body.len() > MAX_BODY {
        bail!("Notes are limited to {} characters.", MAX_BODY);
    }
    Ok(body.to_owned())
}

/// drops duplicates, of each other and of what a note already points at
fn validate_targets(
    targets: Vec<TargetInput>,
    existing: &[AnnotationAnchor],
) -> Result<Vec<TargetInput>> {
    if targets.len() > MAX_TARGETS {
        bail!("A note can point at most at {MAX_TARGETS} places.");
    }
    let mut accepted: Vec<TargetInput> = Vec::new();
    for target in targets {
        validate_anchor(&target.anchor)?;
        if existing.contains(&target.anchor)
            || accepted.iter().any(|other| other.anchor == target.anchor)
        {
            continue;
        }
        accepted.push(TargetInput {
            anchor: target.anchor,
            subject: target.subject.trim().chars().take(300).collect(),
        });
    }
    Ok(accepted)
}

fn validate_anchor(anchor: &AnnotationAnchor) -> Result<()> {
    let hex = |value: &str| {
        !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_alphanumeric())
    };
    if !hex(anchor.change_id()) || !hex(anchor.commit_id()) {
        bail!("Annotations need a change and commit id.");
    }
    if let Some(path) = anchor.path()
        && (path.is_empty() || path.starts_with('/') || path.split('/').any(|part| part == ".."))
    {
        bail!("Annotation paths must be relative to the repository.");
    }
    if let AnnotationAnchor::Lines {
        start, end, quote, ..
    } = anchor
    {
        if *start == 0 || end < start {
            bail!("Choose at least one line.");
        }
        if quote.len() > MAX_QUOTE {
            bail!("Annotate at most {} characters of code.", MAX_QUOTE);
        }
    }
    Ok(())
}

pub fn short_id(id: &str) -> &str {
    &id[..id.len().min(8)]
}

fn short_hash(id: &str) -> &str {
    &id[..id.len().min(12)]
}

pub fn describe_anchor(anchor: &AnnotationAnchor) -> String {
    match anchor {
        AnnotationAnchor::Revision {
            change_id,
            commit_id,
        } => format!(
            "change `{}` (commit `{}`)",
            short_hash(change_id),
            short_hash(commit_id)
        ),
        AnnotationAnchor::Bookmark {
            name,
            remote,
            change_id,
            commit_id,
        } => format!(
            "bookmark `{}{}` at change `{}` (commit `{}`)",
            name,
            remote.as_ref().map(|r| format!("@{r}")).unwrap_or_default(),
            short_hash(change_id),
            short_hash(commit_id)
        ),
        AnnotationAnchor::File {
            change_id,
            commit_id,
            path,
        } => format!(
            "file `{}` in change `{}` (commit `{}`)",
            path,
            short_hash(change_id),
            short_hash(commit_id)
        ),
        AnnotationAnchor::Lines {
            change_id,
            commit_id,
            path,
            side,
            start,
            end,
            ..
        } => format!(
            "`{}` {} {} in change `{}` (commit `{}`){}",
            path,
            if start == end { "line" } else { "lines" },
            if start == end {
                start.to_string()
            } else {
                format!("{start}–{end}")
            },
            short_hash(change_id),
            short_hash(commit_id),
            if *side == LineSide::Old {
                ", before the change"
            } else {
                ""
            }
        ),
    }
}

fn author_label(author: &AnnotationAuthor) -> String {
    match author.kind {
        AuthorKind::Human => author.name.clone(),
        AuthorKind::Agent => format!("{} (agent)", author.name),
    }
}

fn fence(content: &str) -> String {
    let longest = content.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    "`".repeat(longest.max(2) + 1)
}

/// Markdown for pasting into a chat with an LLM: enough location to find the
/// code, and the instruction for replying in place.
pub fn export_markdown(threads: &[AnnotationThread]) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "{} from GG. Ids are jj change and commit ids; paths are relative to the repository root.\n\
         Reply to a note with `gg annotations reply <note> --agent <your name> \"<text>\"`.\n",
        if threads.len() == 1 {
            "A note".to_owned()
        } else {
            format!("{} notes", threads.len())
        }
    ));
    for thread in threads {
        out.push_str(&format!(
            "\n## Note {}{}\n\n",
            short_id(&thread.id),
            if thread.status == AnnotationStatus::Resolved {
                " (resolved)"
            } else {
                ""
            }
        ));
        let several = thread.targets.len() > 1;
        if several {
            out.push_str("Points at:\n");
        }
        for target in &thread.targets {
            out.push_str(if several { "- " } else { "On " });
            out.push_str(&describe_anchor(&target.anchor));
            if !target.subject.is_empty() {
                out.push_str(&format!(", “{}”", target.subject));
            }
            out.push('\n');
            let indent = if several { "  " } else { "" };
            match &target.state {
                AnchorState::Rewritten { commit_id, matches } => out.push_str(&format!(
                    "{indent}The change has been rewritten since; it is now commit `{}`{}.\n",
                    short_hash(commit_id),
                    match matches {
                        Some(true) => " and the annotated lines are unchanged",
                        Some(false) => " and the annotated lines have changed",
                        None => "",
                    }
                )),
                AnchorState::Missing => out.push_str(&format!(
                    "{indent}The change no longer exists in this repository.\n"
                )),
                _ => {}
            }
            if let AnnotationAnchor::Lines { quote, path, .. } = &target.anchor {
                let fence = fence(quote);
                let language = path.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("");
                out.push_str(&format!("\n{fence}{language}\n{quote}\n{fence}\n"));
                if several {
                    out.push('\n');
                }
            }
        }
        for (index, post) in thread.posts.iter().enumerate() {
            if index == 0 {
                out.push_str(&format!(
                    "\n{} wrote:\n\n{}\n",
                    author_label(&post.author),
                    post.body
                ));
            } else {
                out.push_str(&format!(
                    "\nReply from {}:\n\n{}\n",
                    author_label(&post.author),
                    post.body
                ));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn human() -> AnnotationAuthor {
        AnnotationAuthor {
            name: "Ada".into(),
            kind: AuthorKind::Human,
        }
    }

    fn agent() -> AnnotationAuthor {
        AnnotationAuthor {
            name: "claude".into(),
            kind: AuthorKind::Agent,
        }
    }

    fn target(anchor: AnnotationAnchor, subject: &str) -> Vec<TargetInput> {
        vec![TargetInput {
            anchor,
            subject: subject.into(),
        }]
    }

    fn revision(change: &str) -> AnnotationAnchor {
        AnnotationAnchor::Revision {
            change_id: change.into(),
            commit_id: "0123abcd".into(),
        }
    }

    fn lines() -> AnnotationAnchor {
        AnnotationAnchor::Lines {
            change_id: "wnpusytqkxyzwnpusytqkxyzwnpusytq".into(),
            commit_id: "02584342aabbccddeeff00112233445566778899".into(),
            path: "src/lib.rs".into(),
            side: LineSide::New,
            start: 3,
            end: 4,
            quote: "fn main() {\n    let x = ```;".into(),
        }
    }

    #[test]
    fn threads_assemble_from_events() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        let thread = store.create(
            target(lines(), "rename c.txt"),
            "default",
            human(),
            "Why `x`?\n",
        )?;
        assert_eq!(thread.posts.len(), 1);
        assert_eq!(thread.posts[0].body, "Why `x`?");

        store.reply(short_id(&thread.id), agent(), "Because.")?;
        let post = thread.posts[0].id.clone();
        store.edit(&thread.id, &post, human(), "Why is `x` here?")?;
        assert!(store.edit(&thread.id, &post, agent(), "hijack").is_err());
        let resolved = store.set_status(&thread.id, agent(), AnnotationStatus::Resolved)?;

        assert_eq!(resolved.status, AnnotationStatus::Resolved);
        assert_eq!(resolved.posts.len(), 2);
        assert_eq!(resolved.posts[0].body, "Why is `x` here?");
        assert!(resolved.posts[0].edited_at.is_some());
        assert_eq!(resolved.posts[1].author, agent());
        assert_eq!(store.list()?.len(), 1);

        store.delete(&thread.id)?;
        assert!(store.list()?.is_empty());
        Ok(())
    }

    #[test]
    fn damaged_notes_are_skipped_and_ids_must_be_unambiguous() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        let first = store.create(target(lines(), ""), "default", human(), "one")?;
        store.create(target(lines(), ""), "default", human(), "two")?;
        fs::create_dir_all(store.annotations_dir().join("broken"))?;
        fs::write(store.annotations_dir().join("broken/annotation.json"), "{")?;
        assert_eq!(store.list()?.len(), 2);
        assert!(store.resolve_id("").is_err());
        assert!(store.resolve_id("../x").is_err());
        assert_eq!(store.resolve_id(&first.id)?, first.id);
        Ok(())
    }

    #[test]
    fn rejects_empty_notes_and_escaping_paths() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        assert!(
            store
                .create(target(lines(), ""), "", human(), "  \n")
                .is_err()
        );
        let escaping = AnnotationAnchor::File {
            change_id: "abc".into(),
            commit_id: "def".into(),
            path: "../secret".into(),
        };
        assert!(
            store
                .create(target(escaping, ""), "", human(), "note")
                .is_err()
        );
        Ok(())
    }

    #[test]
    fn notes_point_at_several_places() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        let mut targets = target(revision("kkkk"), "first");
        targets.extend(target(revision("kkkk"), "duplicate"));
        targets.extend(target(lines(), "rename c.txt"));
        let thread = store.create(targets, "default", human(), "Compare these")?;
        assert_eq!(thread.targets.len(), 2);

        let thread = store.add_targets(
            &thread.id,
            agent(),
            [target(revision("mmmm"), "third"), target(lines(), "again")].concat(),
        )?;
        assert_eq!(
            thread
                .targets
                .iter()
                .map(|t| t.subject.as_str())
                .collect::<Vec<_>>(),
            ["first", "rename c.txt", "third"]
        );

        let thread = store.remove_target(&thread.id, human(), revision("kkkk"))?;
        assert_eq!(thread.targets.len(), 2);
        assert!(
            store
                .remove_target(&thread.id, human(), revision("zzzz"))
                .is_err()
        );
        store.remove_target(&thread.id, human(), lines())?;
        // the last place can't be removed; the note would point nowhere
        assert!(
            store
                .remove_target(&thread.id, human(), revision("mmmm"))
                .is_err()
        );

        let markdown = export_markdown(&[store.get(&thread.id)?]);
        assert!(markdown.contains("On change `mmmm`"));
        Ok(())
    }

    #[test]
    fn reads_single_place_notes_from_version_one() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        let note = store.annotations_dir().join("0011aa");
        fs::create_dir_all(note.join("events"))?;
        fs::write(
            note.join("annotation.json"),
            r#"{"format":"gg.annotation","version":1,"id":"0011aa","created_at":"2026-11-06T10:00:00Z",
                "author":{"name":"Ada","kind":"human"},"workspace":"default","subject":"old summary",
                "anchor":{"kind":"revision","change_id":"kkkk","commit_id":"0123"}}"#,
        )?;
        fs::write(
            note.join("events/1.json"),
            r#"{"id":"e1","at":"2026-11-06T10:00:00Z","author":{"name":"Ada","kind":"human"},"type":"post","body":"Old note"}"#,
        )?;
        let thread = store.get("0011aa")?;
        assert_eq!(thread.targets.len(), 1);
        assert_eq!(thread.targets[0].subject, "old summary");
        let thread = store.add_targets("0011aa", human(), target(revision("mmmm"), ""))?;
        assert_eq!(thread.targets.len(), 2);
        Ok(())
    }

    #[test]
    fn repo_key_prefers_jj_config_id() -> Result<()> {
        let dir = tempfile::tempdir()?;
        fs::write(dir.path().join("config-id"), "0123456789ABCDEF0123\n")?;
        assert_eq!(repo_key(dir.path()), "0123456789abcdef0123");
        let other = tempfile::tempdir()?;
        let key = repo_key(other.path());
        assert!(key.starts_with("path-"));
        assert_eq!(key, repo_key(other.path()));
        Ok(())
    }

    #[test]
    fn export_keeps_code_exact_and_explains_replies() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let store = AnnotationStore::at(dir.path().to_path_buf());
        let thread = store.create(target(lines(), "rename c.txt"), "default", human(), "Why?")?;
        let mut thread = store.reply(&thread.id, agent(), "Because.")?;
        thread.targets[0].state = AnchorState::Rewritten {
            commit_id: "ffff".into(),
            matches: Some(true),
        };
        let markdown = export_markdown(&[thread]);
        assert!(markdown.contains("gg annotations reply"));
        assert!(markdown.contains("`src/lib.rs` lines 3–4 in change `wnpusytqkxyz`"));
        // the quote contains a triple backtick, so the fence must be longer
        assert!(markdown.contains("````rs\nfn main() {\n    let x = ```;\n````"));
        assert!(markdown.contains("Reply from claude (agent):\n\nBecause."));
        assert!(markdown.contains("annotated lines are unchanged"));
        Ok(())
    }
}
