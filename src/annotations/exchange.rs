use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::Path,
};

use super::{
    AnnotationStore, Event, EventKind, Header, validate_anchor, validate_body, validate_targets,
    write_atomic,
};
use crate::messages::{
    annotation_exchange::{AnnotationArchive, AnnotationBundle, AnnotationContext},
    annotations::{ANNOTATION_FORMAT, ANNOTATION_VERSION, AnnotationThread},
};
use anyhow::{Result, bail};

const MAX_BUNDLE_BYTES: usize = 10 * 1024 * 1024;

pub(crate) fn validate_context(context: &AnnotationContext) -> Result<()> {
    let component = |s: &str| {
        !s.is_empty()
            && s.len() <= 128
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            && !s.contains("..")
    };
    if !component(&context.plugin) || !component(&context.id) {
        bail!("Invalid annotation context");
    }
    Ok(())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn read_archive(dir: &Path) -> Result<AnnotationArchive> {
    let header: Header = serde_json::from_slice(&fs::read(dir.join("annotation.json"))?)?;
    let mut events = Vec::new();
    for entry in fs::read_dir(dir.join("events"))? {
        let path = entry?.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "json")
        {
            events.push(serde_json::from_slice::<Event>(&fs::read(path)?)?);
        }
    }
    events.sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.id.cmp(&b.id)));
    Ok(AnnotationArchive { header, events })
}

fn validate_archive(archive: &AnnotationArchive, context: &AnnotationContext) -> Result<()> {
    let header = &archive.header;
    if header.format != ANNOTATION_FORMAT
        || !(1..=ANNOTATION_VERSION).contains(&header.version)
        || !valid_id(&header.id)
    {
        bail!("Invalid annotation header");
    }
    if header.contexts.is_empty() || header.contexts.iter().any(|candidate| candidate != context) {
        bail!("Annotation belongs to a different plugin context");
    }
    if validate_targets(header.initial_targets(), &[])?.is_empty() {
        bail!("Annotation has no targets");
    }
    let mut ids = HashSet::new();
    let mut posts = HashMap::new();
    for event in &archive.events {
        if !valid_id(&event.id) || !ids.insert(&event.id) {
            bail!("Invalid or duplicate annotation event id");
        }
        match &event.kind {
            EventKind::Post { body } => {
                validate_body(body)?;
                posts.insert(&event.id, &event.author);
            }
            EventKind::Edit { post, body } => {
                validate_body(body)?;
                if posts
                    .get(post)
                    .is_none_or(|author| **author != event.author)
                {
                    bail!("Annotation edit has no matching author and post");
                }
            }
            EventKind::AddTargets { targets } => {
                validate_targets(targets.clone(), &[])?;
            }
            EventKind::RemoveTarget { anchor } => validate_anchor(anchor)?,
            EventKind::Status { .. } => {}
        }
    }
    if posts.is_empty() {
        bail!("Annotation has no posts");
    }
    Ok(())
}

fn write_event(dir: &Path, event: &Event) -> Result<()> {
    let path = dir.join("events").join(format!(
        "{}-{}.json",
        event.at.format("%Y%m%dT%H%M%S%.9fZ"),
        event.id
    ));
    write_atomic(&path, &serde_json::to_vec_pretty(event)?, false)
}

impl AnnotationStore {
    pub fn in_context(&self, id: &str, context: &AnnotationContext) -> Result<AnnotationThread> {
        validate_context(context)?;
        let thread = self.get(id)?;
        if !thread
            .contexts
            .as_deref()
            .unwrap_or_default()
            .contains(context)
        {
            bail!("Annotation belongs to a different plugin context");
        }
        Ok(thread)
    }

    pub fn export_context(&self, context: &AnnotationContext) -> Result<AnnotationBundle> {
        validate_context(context)?;
        let threads = self
            .list()?
            .iter()
            .filter(|thread| {
                thread
                    .contexts
                    .as_deref()
                    .unwrap_or_default()
                    .contains(context)
            })
            .map(|thread| read_archive(&self.annotations_dir().join(&thread.id)))
            .collect::<Result<_>>()?;
        Ok(AnnotationBundle {
            format: "gg.annotation-bundle".into(),
            version: 1,
            threads,
        })
    }

    pub fn import_context(
        &self,
        context: &AnnotationContext,
        bundle: AnnotationBundle,
    ) -> Result<()> {
        validate_context(context)?;
        if bundle.format != "gg.annotation-bundle" || bundle.version != 1 {
            bail!("Unsupported annotation bundle");
        }
        if serde_json::to_vec(&bundle)?.len() > MAX_BUNDLE_BYTES {
            bail!("Annotation bundle exceeds 10 MiB");
        }
        let mut headers = HashSet::new();
        let mut pending = Vec::new();
        for mut archive in bundle.threads {
            archive
                .events
                .sort_by(|a, b| a.at.cmp(&b.at).then_with(|| a.id.cmp(&b.id)));
            validate_archive(&archive, context)?;
            if !headers.insert(archive.header.id.clone()) {
                bail!("Duplicate annotation in bundle");
            }
            let path = self.annotations_dir().join(&archive.header.id);
            let existing = if path.exists() {
                Some(read_archive(&path)?)
            } else {
                None
            };
            if let Some(existing) = &existing {
                if existing.header != archive.header {
                    bail!("Conflicting annotation header {}", archive.header.id);
                }
                let by_id: BTreeMap<_, _> = existing
                    .events
                    .iter()
                    .map(|event| (&event.id, event))
                    .collect();
                for event in &archive.events {
                    if let Some(prior) = by_id.get(&event.id)
                        && *prior != event
                    {
                        bail!("Conflicting annotation event {}", event.id);
                    }
                }
            }
            // preflight every record before exposing any imported records.
            pending.push((archive, existing));
        }
        fs::create_dir_all(self.annotations_dir())?;
        for (archive, existing) in pending {
            let path = self.annotations_dir().join(&archive.header.id);
            if let Some(existing) = existing {
                let ids: HashSet<_> = existing.events.iter().map(|event| &event.id).collect();
                for event in archive
                    .events
                    .iter()
                    .filter(|event| !ids.contains(&event.id))
                {
                    write_event(&path, event)?;
                }
            } else {
                let stage = tempfile::tempdir_in(self.annotations_dir())?;
                fs::create_dir(stage.path().join("events"))?;
                write_atomic(
                    &stage.path().join("annotation.json"),
                    &serde_json::to_vec_pretty(&archive.header)?,
                    false,
                )?;
                for event in &archive.events {
                    write_event(stage.path(), event)?;
                }
                // an incomplete thread never becomes visible to the normal reader.
                fs::rename(stage.path(), path)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::annotations::{
        AnnotationAnchor, AnnotationAuthor, AuthorKind, TargetInput,
    };

    fn context(id: &str) -> AnnotationContext {
        AnnotationContext {
            plugin: "review".into(),
            id: id.into(),
        }
    }
    fn author() -> AnnotationAuthor {
        AnnotationAuthor {
            name: "Reviewer".into(),
            kind: AuthorKind::Human,
        }
    }
    fn targets() -> Vec<TargetInput> {
        vec![TargetInput {
            anchor: AnnotationAnchor::File {
                change_id: "missingchange".into(),
                commit_id: "abcdef".into(),
                path: "src/file.rs".into(),
            },
            subject: "A captured change".into(),
        }]
    }

    #[test]
    fn scoped_threads_round_trip_without_commits_and_merge_events() -> Result<()> {
        let a = tempfile::tempdir()?;
        let b = tempfile::tempdir()?;
        let source = AnnotationStore::at(a.path().into());
        let destination = AnnotationStore::at(b.path().into());
        let scope = context("session-one");
        let thread =
            source.create_in_context(targets(), "default", author(), "question", scope.clone())?;
        assert_eq!(source.list()?[0].contexts, Some(vec![scope.clone()]));
        assert!(
            source
                .in_context(&thread.id, &context("another-session"))
                .is_err()
        );
        let captured = source.export_context(&scope)?;
        destination.import_context(&scope, captured.clone())?;
        destination.import_context(&scope, captured)?;
        assert_eq!(destination.get(&thread.id)?.posts[0].id, thread.posts[0].id);
        source.reply(&thread.id, author(), "answer")?;
        destination.import_context(&scope, source.export_context(&scope)?)?;
        let imported = destination.get(&thread.id)?;
        assert_eq!(imported.posts.len(), 2);
        assert_eq!(imported.posts[1].body, "answer");
        assert_eq!(imported.posts[0].author, author());
        assert!(
            destination
                .export_context(&context("other"))?
                .threads
                .is_empty()
        );
        Ok(())
    }

    #[test]
    fn conflicting_event_rejects_whole_bundle_before_any_write() -> Result<()> {
        let a = tempfile::tempdir()?;
        let b = tempfile::tempdir()?;
        let source = AnnotationStore::at(a.path().into());
        let destination = AnnotationStore::at(b.path().into());
        let scope = context("session");
        let thread =
            source.create_in_context(targets(), "", author(), "original", scope.clone())?;
        destination.import_context(&scope, source.export_context(&scope)?)?;
        source.create_in_context(targets(), "", author(), "new thread", scope.clone())?;
        let mut bundle = source.export_context(&scope)?;
        let conflict = bundle
            .threads
            .iter_mut()
            .find(|item| item.header.id == thread.id)
            .unwrap();
        conflict.events[0].kind = EventKind::Post {
            body: "tampered".into(),
        };
        assert!(destination.import_context(&scope, bundle).is_err());
        assert_eq!(destination.list()?.len(), 1);
        assert_eq!(destination.get(&thread.id)?.posts[0].body, "original");
        Ok(())
    }

    #[test]
    fn rejects_cross_context_and_invalid_paths_without_publishing() -> Result<()> {
        let a = tempfile::tempdir()?;
        let b = tempfile::tempdir()?;
        let source = AnnotationStore::at(a.path().into());
        let destination = AnnotationStore::at(b.path().into());
        let scope = context("session");
        source.create_in_context(targets(), "", author(), "note", scope.clone())?;
        let bundle = source.export_context(&scope)?;
        assert!(
            destination
                .import_context(&context("other"), bundle.clone())
                .is_err()
        );
        let mut escaped = bundle.clone();
        escaped.threads[0].header.id = "../escape".into();
        assert!(destination.import_context(&scope, escaped).is_err());
        let mut escaped = bundle.clone();
        escaped.threads[0].events[0].id = "../escape".into();
        assert!(destination.import_context(&scope, escaped).is_err());
        let mut empty = bundle;
        empty.threads[0].events.clear();
        assert!(destination.import_context(&scope, empty).is_err());
        assert!(destination.list()?.is_empty());
        Ok(())
    }
}
