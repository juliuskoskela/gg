//! Personal review events beside annotations, never in repository history.
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::annotations::{self, AnnotationStore};
use crate::messages::review::ReviewPerson;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileFingerprint {
    pub path: String,
    pub hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReviewEvent {
    pub version: u32,
    pub id: String,
    pub at: DateTime<Utc>,
    pub person: ReviewPerson,
    pub change_id: String,
    pub commit_id: String,
    pub path: Option<String>,
    pub reviewed: bool,
    pub files: Vec<FileFingerprint>,
}

#[derive(Clone, Debug)]
pub struct FileMark {
    pub commit_id: String,
    pub at: DateTime<Utc>,
    pub hash: String,
    pub origin_change_id: Option<String>,
}

#[derive(Default, Debug)]
pub struct ChangeMarks {
    pub whole: Option<String>,
    pub files: BTreeMap<String, FileMark>,
}

pub struct ReviewStore {
    dir: PathBuf,
}

impl ReviewStore {
    pub fn for_repo(repo: &Path, workspace: &Path) -> Result<Self> {
        Ok(Self::at(
            AnnotationStore::for_repo(repo, workspace)?
                .location()
                .join("reviews"),
        ))
    }

    pub fn at(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn location(&self) -> &Path {
        &self.dir
    }

    pub fn append(&self, mut event: ReviewEvent) -> Result<()> {
        event.version = 1;
        event.id = uuid::Uuid::new_v4().simple().to_string();
        fs::create_dir_all(&self.dir)?;
        annotations::write_atomic(
            &self.dir.join(format!("{}.json", event.id)),
            &serde_json::to_vec_pretty(&event)?,
            false,
        )
    }

    pub(crate) fn events(&self, person: &ReviewPerson) -> Result<Vec<ReviewEvent>> {
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Vec::new());
            }
            Err(error) => return Err(error.into()),
        };
        let mut events = Vec::new();
        for entry in entries {
            let path = entry?.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let event: ReviewEvent = serde_json::from_slice(&fs::read(&path)?)
                .with_context(|| format!("Reading review event {}", path.display()))?;
            anyhow::ensure!(
                event.version == 1,
                "Unsupported review event version {}",
                event.version
            );
            if event.person.key() == person.key() {
                events.push(event);
            }
        }
        events.sort_by(|a, b| (&a.at, &a.id).cmp(&(&b.at, &b.id)));
        Ok(events)
    }

    pub fn marks(&self, person: &ReviewPerson) -> Result<BTreeMap<String, ChangeMarks>> {
        let mut changes = BTreeMap::new();
        for event in self.events(person)? {
            apply_event(&mut changes, event);
        }
        changes.retain(|_, marks| marks.whole.is_some() || !marks.files.is_empty());
        Ok(changes)
    }
}

pub(crate) fn apply_event(changes: &mut BTreeMap<String, ChangeMarks>, event: ReviewEvent) {
    let marks = changes.entry(event.change_id).or_default();
    if let Some(path) = event.path {
        marks.whole = None;
        marks.files.remove(&path);
    } else {
        marks.files.clear();
        marks.whole = event.reviewed.then(|| event.commit_id.clone());
    }
    if event.reviewed {
        for file in event.files {
            marks.files.insert(
                file.path,
                FileMark {
                    commit_id: event.commit_id.clone(),
                    at: event.at,
                    hash: file.hash,
                    origin_change_id: None,
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(person: &str, path: Option<&str>, reviewed: bool) -> ReviewEvent {
        ReviewEvent {
            version: 1,
            id: String::new(),
            at: Utc::now(),
            person: ReviewPerson {
                name: person.into(),
                email: format!("{person}@example.test"),
            },
            change_id: "change".into(),
            commit_id: "commit".into(),
            path: path.map(str::to_owned),
            reviewed,
            files: if reviewed {
                vec![FileFingerprint {
                    path: path.unwrap_or("a.txt").into(),
                    hash: "hash".into(),
                }]
            } else {
                vec![]
            },
        }
    }

    #[test]
    fn events_are_append_only_personal_and_reversible() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = ReviewStore::at(directory.path().to_owned());
        let alice = event("alice", None, true);
        store.append(alice.clone())?;
        let original_files: Vec<_> = fs::read_dir(directory.path())?
            .map(|entry| entry.unwrap().path())
            .collect();
        let bytes = fs::read(&original_files[0])?;
        store.append(event("bob", Some("b.txt"), true))?;
        assert_eq!(store.marks(&alice.person)?["change"].files.len(), 1);
        store.append(event("alice", Some("a.txt"), false))?;
        assert!(store.marks(&alice.person)?.is_empty());
        assert_eq!(fs::read(&original_files[0])?, bytes);
        assert_eq!(fs::read_dir(directory.path())?.count(), 3);
        assert_eq!(
            store.marks(&event("bob", None, true).person)?["change"]
                .files
                .len(),
            1
        );
        Ok(())
    }

    #[test]
    fn marking_whole_change_replaces_older_file_snapshot_and_clear_removes_it() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let store = ReviewStore::at(directory.path().to_owned());
        store.append(event("alice", Some("old.txt"), true))?;
        let whole = event("alice", None, true);
        store.append(whole.clone())?;
        let marks = store.marks(&whole.person)?;
        assert!(!marks["change"].files.contains_key("old.txt"));
        assert_eq!(marks["change"].whole.as_deref(), Some("commit"));
        store.append(event("alice", None, false))?;
        assert!(store.marks(&whole.person)?.is_empty());
        Ok(())
    }
}
