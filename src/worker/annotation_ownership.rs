use std::collections::{HashMap, HashSet};

use anyhow::{Context as _, Result};
use futures_util::{StreamExt as _, TryStreamExt as _};
use jj_lib::{backend::CommitId, object_id::ObjectId as _};

use super::WorkspaceSession;
use crate::{
    messages::{
        RevId,
        annotations::{AnnotationAnchor, AnnotationRelocation, AnnotationThread},
        splits::SplitOwner,
    },
    splits::SplitReceipt,
};

const UNAVAILABLE: &str = "Split ownership unavailable; original anchor retained.";

fn with_owner(anchor: &AnnotationAnchor, owner: &RevId) -> AnnotationAnchor {
    let mut next = anchor.clone();
    let (change_id, commit_id) = match &mut next {
        AnnotationAnchor::Revision {
            change_id,
            commit_id,
        }
        | AnnotationAnchor::Bookmark {
            change_id,
            commit_id,
            ..
        }
        | AnnotationAnchor::File {
            change_id,
            commit_id,
            ..
        }
        | AnnotationAnchor::Lines {
            change_id,
            commit_id,
            ..
        } => (change_id, commit_id),
    };
    *change_id = owner.change.hex.clone();
    *commit_id = owner.commit.hex.clone();
    next
}

async fn predecessor(
    ws: &WorkspaceSession<'_>,
    source: &str,
    basis: &str,
    cache: &mut HashMap<(String, String), bool>,
) -> Result<bool> {
    if source == basis {
        return Ok(true);
    }
    let key = (source.to_owned(), basis.to_owned());
    if let Some(known) = cache.get(&key) {
        return Ok(*known);
    }
    let id = CommitId::try_from_hex(source).context("invalid split source commit")?;
    let mut predecessors = jj_lib::evolution::walk_predecessors(ws.repo(), &[id]).boxed_local();
    let mut found = false;
    while let Some(entry) = predecessors.try_next().await? {
        if entry.commit.id().hex() == basis {
            found = true;
            break;
        }
    }
    cache.insert(key, found);
    Ok(found)
}

fn move_through(anchor: &AnnotationAnchor, receipt: &SplitReceipt) -> Result<RevId, &'static str> {
    let Some(path) = anchor.path() else {
        return Err("This change was split. Choose which part this note belongs to.");
    };
    let Some(ownership) = receipt.ownership.iter().find(|entry| entry.path == path) else {
        return Err(
            "This file was not part of the split patch. Choose which part this note belongs to.",
        );
    };
    Ok(match ownership.owner {
        SplitOwner::Selected => receipt.selected.clone(),
        SplitOwner::Remainder => receipt.remainder.clone(),
    })
}

pub(super) async fn apply(
    ws: &WorkspaceSession<'_>,
    threads: &mut [AnnotationThread],
) -> Result<()> {
    if threads.is_empty() {
        return Ok(());
    }
    let receipts = match super::splits::active_receipts(ws).await {
        Ok(receipts) => receipts,
        Err(error) => {
            log::warn!("Cannot resolve annotation split ownership: {error:#}");
            for thread in threads {
                for target in &mut thread.targets {
                    target.relocation = Some(AnnotationRelocation {
                        owner: None,
                        receipts: Vec::new(),
                        reason: Some(UNAVAILABLE.to_owned()),
                    });
                }
            }
            return Ok(());
        }
    };
    apply_receipts(ws, threads, &receipts).await
}

async fn apply_receipts(
    ws: &WorkspaceSession<'_>,
    threads: &mut [AnnotationThread],
    receipts: &[SplitReceipt],
) -> Result<()> {
    if receipts.is_empty() {
        return Ok(());
    }
    let mut cache = HashMap::new();
    for thread in threads {
        for target in &mut thread.targets {
            let mut current = target.anchor.clone();
            let mut used = HashSet::new();
            let mut traversed = Vec::new();
            let mut owner = None;
            let mut reason = None;
            // prefer the earliest applicable rewrite, independent of wall-clock order.
            'history: loop {
                let mut candidates = Vec::new();
                for receipt in receipts {
                    if used.contains(&receipt.id)
                        || current.change_id() != receipt.source.change.hex
                    {
                        continue;
                    }
                    match predecessor(
                        ws,
                        &receipt.source.commit.hex,
                        current.commit_id(),
                        &mut cache,
                    )
                    .await
                    {
                        Ok(true) => candidates.push(receipt),
                        Ok(false) => {}
                        Err(error) => {
                            log::warn!("Cannot resolve annotation split lineage: {error:#}");
                            traversed.push(receipt.id.clone());
                            owner = None;
                            reason = Some(UNAVAILABLE.to_owned());
                            break 'history;
                        }
                    }
                }
                let mut earliest = Vec::new();
                for candidate in &candidates {
                    let mut follows_another = false;
                    for other in &candidates {
                        if candidate.id == other.id
                            || candidate.source.commit.hex == other.source.commit.hex
                        {
                            continue;
                        }
                        match predecessor(
                            ws,
                            &candidate.source.commit.hex,
                            &other.source.commit.hex,
                            &mut cache,
                        )
                        .await
                        {
                            Ok(true) => {
                                follows_another = true;
                                break;
                            }
                            Ok(false) => {}
                            Err(error) => {
                                log::warn!("Cannot order annotation split lineage: {error:#}");
                                traversed
                                    .extend(candidates.iter().map(|receipt| receipt.id.clone()));
                                owner = None;
                                reason = Some(UNAVAILABLE.to_owned());
                                break 'history;
                            }
                        }
                    }
                    if !follows_another {
                        earliest.push(*candidate);
                    }
                }
                let receipt = match earliest.as_slice() {
                    [] => break,
                    [receipt] => *receipt,
                    _ => {
                        traversed.extend(earliest.iter().map(|receipt| receipt.id.clone()));
                        reason = Some(
                            "Several split histories match this note. Choose its owner.".to_owned(),
                        );
                        owner = None;
                        break;
                    }
                };
                used.insert(receipt.id.clone());
                traversed.push(receipt.id.clone());
                match move_through(&current, receipt) {
                    Ok(next) => {
                        current = with_owner(&current, &next);
                        owner = Some(next);
                    }
                    Err(message) => {
                        reason = Some(message.to_owned());
                        owner = None;
                        break;
                    }
                }
            }
            if traversed.is_empty() {
                continue;
            }
            if let Some(owner) = &owner {
                // keep the original basis: a new split commit must not imply the old quote was checked there.
                let mut basis = owner.clone();
                basis.commit.hex = target.anchor.commit_id().to_owned();
                target.state =
                    super::annotations::anchor_state(ws, &with_owner(&target.anchor, &basis));
            }
            target.relocation = Some(AnnotationRelocation {
                owner,
                receipts: traversed,
                reason,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        annotations::AnnotationStore,
        messages::{
            annotations::{AnchorState, AnnotationAuthor, AuthorKind, LineSide, TargetInput},
            mutations::{MutationOptions, MutationResult, RedoOperation, UndoOperation},
            splits::SplitRevision,
        },
        splits::SplitStore,
        worker::{Mutation as _, WorkerSession, tests::mkrepo},
    };

    fn line(id: &RevId, quote: &str) -> AnnotationAnchor {
        AnnotationAnchor::Lines {
            change_id: id.change.hex.clone(),
            commit_id: id.commit.hex.clone(),
            path: "second.txt".into(),
            side: LineSide::New,
            start: 1,
            end: 1,
            quote: quote.into(),
        }
    }

    #[tokio::test]
    async fn split_owner_is_explicit_and_undo_leaves_original_anchor() -> Result<()> {
        let repo = mkrepo();
        let data = tempfile::tempdir()?;
        let notes = AnnotationStore::at(data.path().join("notes"));
        let splits = SplitStore::at(data.path().join("splits"));
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(repo.path()).await?;
        std::fs::write(repo.path().join("first.txt"), "first\n")?;
        std::fs::write(repo.path().join("second.txt"), "second\n")?;
        ws.import_and_snapshot(true, false).await?;
        let source = ws.format_id(&ws.get_commit(ws.wc_id())?);
        let original = line(&source, "second");
        let thread = notes.create(
            vec![
                TargetInput {
                    anchor: original.clone(),
                    subject: String::new(),
                },
                TargetInput {
                    anchor: AnnotationAnchor::Revision {
                        change_id: source.change.hex.clone(),
                        commit_id: source.commit.hex.clone(),
                    },
                    subject: String::new(),
                },
            ],
            "default",
            AnnotationAuthor {
                name: "Reviewer".into(),
                kind: AuthorKind::Human,
            },
            "note",
        )?;
        let request = SplitRevision {
            source: source.clone(),
            operation_id: ws.repo().operation().id().hex(),
            paths: vec!["first.txt".into()],
            selected_description: "first".into(),
            remainder_description: "second".into(),
        };
        let MutationResult::Split { outcome, .. } =
            super::super::splits::split(&mut ws, request, &MutationOptions::default(), &splits)
                .await?
        else {
            panic!("split expected");
        };
        let mut threads = notes.list()?;
        apply_receipts(
            &ws,
            &mut threads,
            &super::super::splits::active_receipts_in(&ws, &splits).await?,
        )
        .await?;
        assert_eq!(threads[0].targets[0].anchor, original);
        assert_eq!(
            threads[0].targets[0]
                .relocation
                .as_ref()
                .unwrap()
                .owner
                .as_ref()
                .unwrap()
                .change
                .hex,
            outcome.remainder.change.hex
        );
        assert!(matches!(
            threads[0].targets[0].state,
            AnchorState::Rewritten {
                matches: Some(true),
                ..
            }
        ));
        assert!(
            threads[0].targets[1]
                .relocation
                .as_ref()
                .unwrap()
                .reason
                .is_some()
        );
        assert!(
            threads[0].targets[1]
                .relocation
                .as_ref()
                .unwrap()
                .owner
                .is_none()
        );
        assert_eq!(notes.get(&thread.id)?.targets[0].anchor, original);
        let exported = crate::annotations::export_markdown(&threads);
        assert!(exported.contains("Moved by split to change"));
        assert!(exported.contains(&outcome.remainder.change.hex));
        let receipts = super::super::splits::active_receipts_in(&ws, &splits).await?;
        let mut competing = receipts.clone();
        let mut duplicate = receipts[0].clone();
        duplicate.id = "competing-receipt".into();
        competing.push(duplicate);
        let mut ambiguous = notes.list()?;
        apply_receipts(&ws, &mut ambiguous, &competing).await?;
        let relocation = ambiguous[0].targets[0].relocation.as_ref().unwrap();
        assert!(relocation.owner.is_none());
        assert_eq!(relocation.receipts.len(), 2);
        assert!(
            relocation
                .reason
                .as_ref()
                .unwrap()
                .contains("Several split histories")
        );
        assert_eq!(ambiguous[0].targets[0].anchor, original);

        let mut missing = receipts;
        missing[0].source.commit.hex = "00".repeat(32);
        let mut unavailable = notes.list()?;
        apply_receipts(&ws, &mut unavailable, &missing).await?;
        let relocation = unavailable[0].targets[0].relocation.as_ref().unwrap();
        assert!(relocation.owner.is_none());
        assert_eq!(relocation.reason.as_deref(), Some(UNAVAILABLE));
        assert_eq!(unavailable[0].targets[0].anchor, original);

        UndoOperation.execute_unboxed(&mut ws).await?;
        let mut undone = notes.list()?;
        apply_receipts(
            &ws,
            &mut undone,
            &super::super::splits::active_receipts_in(&ws, &splits).await?,
        )
        .await?;
        assert!(undone[0].targets[0].relocation.is_none());
        RedoOperation.execute_unboxed(&mut ws).await?;
        let mut redone = notes.list()?;
        apply_receipts(
            &ws,
            &mut redone,
            &super::super::splits::active_receipts_in(&ws, &splits).await?,
        )
        .await?;
        assert!(redone[0].targets[0].relocation.is_some());
        Ok(())
    }

    #[tokio::test]
    async fn earlier_basis_follows_split_but_changed_quote_stays_changed() -> Result<()> {
        let repo = mkrepo();
        let data = tempfile::tempdir()?;
        let notes = AnnotationStore::at(data.path().join("notes"));
        let splits = SplitStore::at(data.path().join("splits"));
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(repo.path()).await?;
        std::fs::write(repo.path().join("first.txt"), "first\n")?;
        std::fs::write(repo.path().join("second.txt"), "original\n")?;
        ws.import_and_snapshot(true, false).await?;
        let old = ws.format_id(&ws.get_commit(ws.wc_id())?);
        notes.create(
            vec![TargetInput {
                anchor: line(&old, "original"),
                subject: String::new(),
            }],
            "default",
            AnnotationAuthor {
                name: "Reviewer".into(),
                kind: AuthorKind::Human,
            },
            "note",
        )?;
        std::fs::write(repo.path().join("second.txt"), "changed\n")?;
        ws.import_and_snapshot(true, false).await?;
        let source = ws.format_id(&ws.get_commit(ws.wc_id())?);
        let request = SplitRevision {
            source,
            operation_id: ws.repo().operation().id().hex(),
            paths: vec!["first.txt".into()],
            selected_description: "first".into(),
            remainder_description: "second".into(),
        };
        super::super::splits::split(&mut ws, request, &MutationOptions::default(), &splits).await?;
        let mut threads = notes.list()?;
        apply_receipts(
            &ws,
            &mut threads,
            &super::super::splits::active_receipts_in(&ws, &splits).await?,
        )
        .await?;
        assert!(
            threads[0].targets[0]
                .relocation
                .as_ref()
                .unwrap()
                .owner
                .is_some()
        );
        assert!(matches!(
            threads[0].targets[0].state,
            AnchorState::Rewritten {
                matches: Some(false),
                ..
            }
        ));
        assert_eq!(threads[0].targets[0].anchor.commit_id(), old.commit.hex);
        Ok(())
    }
    #[tokio::test]
    async fn repeated_splits_follow_history_even_when_receipts_are_reversed() -> Result<()> {
        let repo = mkrepo();
        let data = tempfile::tempdir()?;
        let notes = AnnotationStore::at(data.path().join("notes"));
        let splits = SplitStore::at(data.path().join("splits"));
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(repo.path()).await?;
        for file in ["first.txt", "second.txt", "third.txt"] {
            std::fs::write(repo.path().join(file), file)?;
        }
        ws.import_and_snapshot(true, false).await?;
        let source = ws.format_id(&ws.get_commit(ws.wc_id())?);
        notes.create(
            vec![TargetInput {
                anchor: line(&source, "second.txt"),
                subject: String::new(),
            }],
            "default",
            AnnotationAuthor {
                name: "Reviewer".into(),
                kind: AuthorKind::Human,
            },
            "note",
        )?;
        let request = SplitRevision {
            source,
            operation_id: ws.repo().operation().id().hex(),
            paths: vec!["first.txt".into(), "second.txt".into()],
            selected_description: "first pair".into(),
            remainder_description: "third".into(),
        };
        let MutationResult::Split { outcome: first, .. } =
            super::super::splits::split(&mut ws, request, &MutationOptions::default(), &splits)
                .await?
        else {
            panic!("split expected");
        };
        let request = SplitRevision {
            source: first.selected,
            operation_id: ws.repo().operation().id().hex(),
            paths: vec!["first.txt".into()],
            selected_description: "first".into(),
            remainder_description: "second".into(),
        };
        let MutationResult::Split {
            outcome: second, ..
        } = super::super::splits::split(&mut ws, request, &MutationOptions::default(), &splits)
            .await?
        else {
            panic!("split expected");
        };
        let mut receipts = super::super::splits::active_receipts_in(&ws, &splits).await?;
        receipts.reverse();
        let mut threads = notes.list()?;
        apply_receipts(&ws, &mut threads, &receipts).await?;
        let moved = threads[0].targets[0].relocation.as_ref().unwrap();
        assert_eq!(moved.receipts.len(), 2);
        assert_eq!(
            moved.owner.as_ref().unwrap().change.hex,
            second.remainder.change.hex
        );
        let after = notes.create(
            vec![TargetInput {
                anchor: AnnotationAnchor::File {
                    change_id: second.selected.change.hex.clone(),
                    commit_id: second.selected.commit.hex.clone(),
                    path: "first.txt".into(),
                },
                subject: String::new(),
            }],
            "default",
            AnnotationAuthor {
                name: "Reviewer".into(),
                kind: AuthorKind::Human,
            },
            "after split",
        )?;
        let mut later = vec![after];
        apply_receipts(&ws, &mut later, &receipts).await?;
        assert!(later[0].targets[0].relocation.is_none());
        Ok(())
    }
}
