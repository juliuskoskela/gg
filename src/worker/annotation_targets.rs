use anyhow::{Context as _, Result, bail};
use jj_lib::{
    backend::TreeValue, ref_name::RefName, repo::Repo as _, repo_path::RepoPath, rewrite,
};

use super::{WorkspaceSession, mutations::read_file_content};
use crate::messages::annotations::{AnnotationAnchor, LineSide, TargetInput};

pub(crate) struct TargetQuery<'a> {
    pub revision: &'a str,
    pub bookmark: Option<&'a str>,
    pub file: Option<&'a str>,
    pub lines: Option<&'a str>,
    pub side: LineSide,
}

pub(crate) async fn resolve(
    ws: &WorkspaceSession<'_>,
    query: TargetQuery<'_>,
) -> Result<TargetInput> {
    if query.file.is_none() && matches!(query.side, LineSide::Old) {
        bail!("--side old requires --file");
    }
    let commit = if let Some(name) = query.bookmark {
        let target = ws.view().get_local_bookmark(RefName::new(name));
        let id = target
            .as_normal()
            .context("The bookmark must point to one commit")?;
        ws.get_commit(id)?
    } else {
        let commits = ws.resolve_multiple(ws.evaluate_revset_str(query.revision)?)?;
        let [commit] = commits.as_slice() else {
            bail!("The revision must resolve to exactly one commit");
        };
        commit.clone()
    };
    let id = ws.format_id(&commit);
    let subject = commit
        .description()
        .lines()
        .next()
        .unwrap_or_default()
        .to_owned();
    let change_id = id.change.hex;
    let commit_id = id.commit.hex;
    let anchor = if let Some(file) = query.file {
        if file.is_empty() {
            bail!("A file path is required");
        }
        let path = RepoPath::from_internal_string(file)?;
        let tree = match query.side {
            LineSide::New => commit.tree(),
            LineSide::Old => {
                rewrite::merge_commit_trees(ws.repo(), &commit.parents().await?).await?
            }
        };
        let entry = tree.path_value(path).await?.into_resolved();
        if matches!(entry, Ok(None)) {
            bail!("The file is absent from the selected side of this revision");
        }
        if let Some(range) = query.lines {
            if !matches!(entry, Ok(Some(TreeValue::File { .. }))) {
                bail!("Line targets require a regular, conflict-free text file");
            }
            let (start, end) = range.split_once('-').unwrap_or((range, range));
            let start: u32 = start
                .parse()
                .context("Line numbers must be positive integers")?;
            let end: u32 = end
                .parse()
                .context("Line numbers must be positive integers")?;
            if start == 0 || end < start {
                bail!("Line range must start at 1 or later and end after its start");
            }
            let content = read_file_content(ws.repo().store(), &tree, path).await?;
            let text = String::from_utf8(content).context("Line targets require UTF-8 text")?;
            if text.contains('\0') {
                bail!("Line targets require a text file");
            }
            let lines: Vec<_> = text.lines().collect();
            if end as usize > lines.len() {
                bail!("Line range exceeds the file's {} lines", lines.len());
            }
            AnnotationAnchor::Lines {
                change_id,
                commit_id,
                path: file.to_owned(),
                side: query.side,
                start,
                end,
                quote: lines[start as usize - 1..end as usize].join("\n"),
            }
        } else {
            AnnotationAnchor::File {
                change_id,
                commit_id,
                path: file.to_owned(),
            }
        }
    } else if query.lines.is_some() {
        bail!("Line targets require --file");
    } else if let Some(name) = query.bookmark {
        AnnotationAnchor::Bookmark {
            change_id,
            commit_id,
            name: name.to_owned(),
            remote: None,
        }
    } else {
        AnnotationAnchor::Revision {
            change_id,
            commit_id,
        }
    };
    Ok(TargetInput { anchor, subject })
}

#[cfg(all(test, not(feature = "ts-rs")))]
mod tests {
    use super::*;
    use crate::worker::{WorkerSession, tests::mkrepo};

    #[tokio::test]
    async fn targets_use_exact_retained_versions_and_validated_lines() -> Result<()> {
        let repo = mkrepo();
        let mut session = WorkerSession::default();
        let mut ws = session.load_workspace(repo.path()).await?;
        std::fs::write(repo.path().join("note.txt"), "first\nsecond\n")?;
        ws.import_and_snapshot(true, false).await?;
        let operation = ws.repo().operation().id().clone();
        let target = resolve(
            &ws,
            TargetQuery {
                revision: "@",
                bookmark: None,
                file: Some("note.txt"),
                lines: Some("2"),
                side: LineSide::New,
            },
        )
        .await?;
        assert!(
            matches!(&target.anchor, AnnotationAnchor::Lines { start: 2, end: 2, quote, .. } if quote == "second")
        );
        assert_eq!(
            target.anchor.commit_id(),
            ws.format_id(&ws.get_commit(ws.wc_id())?).commit.hex
        );
        for range in ["0", "2-1", "1-3", "one", "1-2-3"] {
            assert!(
                resolve(
                    &ws,
                    TargetQuery {
                        revision: "@",
                        bookmark: None,
                        file: Some("note.txt"),
                        lines: Some(range),
                        side: LineSide::New
                    }
                )
                .await
                .is_err()
            );
        }
        assert!(
            resolve(
                &ws,
                TargetQuery {
                    revision: "all()",
                    bookmark: None,
                    file: None,
                    lines: None,
                    side: LineSide::New
                }
            )
            .await
            .is_err()
        );
        assert!(
            resolve(
                &ws,
                TargetQuery {
                    revision: "@",
                    bookmark: None,
                    file: Some("../note.txt"),
                    lines: None,
                    side: LineSide::New
                }
            )
            .await
            .is_err()
        );
        let bookmark = resolve(
            &ws,
            TargetQuery {
                revision: "@",
                bookmark: Some("main"),
                file: None,
                lines: None,
                side: LineSide::New,
            },
        )
        .await?;
        assert!(
            matches!(bookmark.anchor, AnnotationAnchor::Bookmark { ref name, .. } if name == "main")
        );
        assert_eq!(ws.repo().operation().id(), &operation);
        Ok(())
    }
    #[tokio::test]
    async fn readonly_loading_refuses_concurrent_operations_without_reconciling() -> Result<()> {
        let directory = mkrepo();
        let mut session = WorkerSession::default();
        let ws = session.load_workspace(directory.path()).await?;
        let repo = ws.repo().loader().load_at(ws.repo().operation()).await?;
        repo.start_transaction().commit("left operation").await?;
        repo.start_transaction().commit("right operation").await?;
        let mut before = repo.op_heads_store().get_op_heads().await?;
        before.sort();
        assert_eq!(before.len(), 2);
        let mut reader = WorkerSession::default();
        let error = reader
            .load_workspace_readonly(directory.path())
            .await
            .err()
            .unwrap();
        assert!(
            error
                .to_string()
                .contains("Concurrent repository operations")
        );
        let mut after = repo.op_heads_store().get_op_heads().await?;
        after.sort();
        assert_eq!(before, after);
        Ok(())
    }
}
