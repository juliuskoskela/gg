use anyhow::{Result, ensure};
use chrono::Utc;
use futures_util::{StreamExt as _, TryStreamExt as _};
use jj_lib::{
    commit::Commit, content_hash, matchers::EverythingMatcher, merged_tree::TreeDiffEntry,
    object_id::ObjectId as _, repo::Repo as _, revset::RevsetStreamExt as _, rewrite,
};

use super::WorkspaceSession;
use super::{mutations::read_file_content, queries::get_unified_hunks};
use crate::messages::review::{
    ChangeReview, FileReview, ReviewPerson, ReviewProgress, ReviewRequest, ReviewState,
};
use crate::review::{FileFingerprint, ReviewEvent, ReviewStore};
use jj_lib::{backend::TreeValue, merge::Merge};

fn person(ws: &WorkspaceSession) -> ReviewPerson {
    ReviewPerson {
        name: ws.data.workspace_settings.user_name().to_owned(),
        email: ws.data.workspace_settings.user_email().to_owned(),
    }
}

async fn fingerprint(ws: &WorkspaceSession<'_>, commit: &Commit) -> Result<Vec<FileFingerprint>> {
    let parents = commit.parents().await?;
    let before = rewrite::merge_commit_trees(ws.repo(), &parents).await?;
    let after = commit.tree();
    let mut stream = before.diff_stream(&after, &EverythingMatcher);
    let mut files = Vec::new();
    while let Some(TreeDiffEntry { path, values }) = stream.next().await {
        let values = values?;
        let path_text = path.as_internal_file_string();
        let hash = if let (Some(left_kind), Some(right_kind)) =
            (text_kind(&values.before), text_kind(&values.after))
        {
            let left = read_file_content(ws.repo().store(), &before, &path).await?;
            let right = read_file_content(ws.repo().store(), &after, &path).await?;
            match canonical_text_diff(&left, &right)? {
                Some(diff) => format!(
                    "patch-v1:{}",
                    hash_hex(&(path_text.to_owned(), left_kind, right_kind, diff))
                ),
                None => format!("value-v1:{}", hash_hex(&(values.before, values.after))),
            }
        } else {
            format!("value-v1:{}", hash_hex(&(values.before, values.after)))
        };
        files.push(FileFingerprint {
            path: path_text.to_owned(),
            hash,
        });
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

fn hash_hex(value: &impl content_hash::ContentHash) -> String {
    content_hash::blake2b_hash(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn text_kind(value: &Merge<Option<TreeValue>>) -> Option<String> {
    match value.as_resolved()? {
        None => Some("absent".to_owned()),
        Some(TreeValue::File { executable, .. }) => Some(format!("file:{executable}")),
        _ => None,
    }
}

fn canonical_text_diff(left: &[u8], right: &[u8]) -> Result<Option<String>> {
    let (Ok(left_text), Ok(right_text)) = (std::str::from_utf8(left), std::str::from_utf8(right))
    else {
        return Ok(None);
    };
    if left.contains(&0) || right.contains(&0) {
        return Ok(None);
    }
    let mut patches = Vec::new();
    for hunk in get_unified_hunks(3, left, right)? {
        let fragment = |skip: &str| {
            hunk.lines
                .lines
                .iter()
                .filter(|line| !line.starts_with(skip))
                .map(|line| &line[1..])
                .collect::<String>()
        };
        let old = fragment("+");
        let new = fragment("-");
        // repeated contexts need their position to distinguish two identical edits.
        let unique = |text: &str, part: &str| {
            if part.is_empty() {
                text.is_empty()
            } else {
                text.as_bytes()
                    .windows(part.len())
                    .filter(|window| *window == part.as_bytes())
                    .count()
                    == 1
            }
        };
        let position = (!(unique(left_text, &old) && unique(right_text, &new)))
            .then_some((hunk.location.from_file.start, hunk.location.to_file.start));
        patches.push((position, hunk.lines.lines));
    }
    Ok(Some(serde_json::to_string(&patches)?))
}

pub async fn handle(ws: &WorkspaceSession<'_>, request: ReviewRequest) -> Result<ReviewProgress> {
    let store = ReviewStore::for_repo(ws.workspace.repo_path(), ws.workspace.workspace_root())?;
    handle_with_store(ws, request, &store).await
}

pub(super) async fn handle_with_store(
    ws: &WorkspaceSession<'_>,
    request: ReviewRequest,
    store: &ReviewStore,
) -> Result<ReviewProgress> {
    let me = person(ws);
    if let ReviewRequest::Set { id, path, reviewed } = request {
        ensure!(
            !id.commit.hex.is_empty()
                && id.commit.hex.len() <= 128
                && id.commit.hex.len() % 2 == 0
                && id.commit.hex.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid commit id"
        );
        let commit = ws.repo().store().get_commit(
            &jj_lib::backend::CommitId::try_from_hex(&id.commit.hex)
                .ok_or_else(|| anyhow::anyhow!("Invalid commit id"))?,
        )?;
        ensure!(
            commit.change_id().reverse_hex() == id.change.hex,
            "The revision no longer matches this change"
        );
        let mut files = fingerprint(ws, &commit).await?;
        if let Some(path) = &path {
            files.retain(|file| &file.path == path);
            ensure!(
                !reviewed || !files.is_empty(),
                "This file no longer changes in this revision"
            );
        }
        store.append(ReviewEvent {
            version: 1,
            id: String::new(),
            at: Utc::now(),
            person: me.clone(),
            change_id: id.change.hex,
            commit_id: id.commit.hex,
            path,
            reviewed,
            files,
        })?;
    }
    let mut changes = Vec::new();
    let projected = super::splits::project_events(
        store.events(&me)?,
        &super::splits::active_receipts(ws).await?,
    );
    for (change_id, marks) in projected {
        ensure!(
            !change_id.is_empty() && change_id.bytes().all(|b| b.is_ascii_lowercase()),
            "Invalid change id in review state"
        );
        let revset = ws.evaluate_revset_str(&format!("change_id({change_id})"))?;
        let commits: Vec<_> = revset
            .as_ref()
            .stream()
            .commits(ws.repo().store())
            .try_collect()
            .await?;
        let current = if commits.len() == 1 {
            Some(&commits[0])
        } else {
            None
        };
        let fingerprints = match current {
            Some(commit) => fingerprint(ws, commit).await?,
            None => Vec::new(),
        };
        let missing = commits.is_empty();
        let current_id = current.map(|commit| commit.id().hex());
        let whole_description_matches = match (&marks.whole, current) {
            (Some(id), Some(current)) => jj_lib::backend::CommitId::try_from_hex(id)
                .and_then(|id| ws.repo().store().get_commit(&id).ok())
                .is_some_and(|reviewed| reviewed.description() == current.description()),
            (None, _) => true,
            _ => false,
        };
        let files: Vec<_> = marks
            .files
            .iter()
            .map(|(path, mark)| {
                let state = match fingerprints.iter().find(|file| &file.path == path) {
                    Some(file)
                        if current_id.as_ref() == Some(&mark.commit_id)
                            || file.hash == mark.hash =>
                    {
                        ReviewState::Reviewed
                    }
                    Some(_) => ReviewState::Changed,
                    None if missing || current.is_some() => ReviewState::Gone,
                    None => ReviewState::Changed,
                };
                FileReview {
                    path: path.clone(),
                    reviewed_commit_id: mark.commit_id.clone(),
                    reviewed_change_id: mark.origin_change_id.clone(),
                    reviewed_at: mark.at,
                    state,
                }
            })
            .collect();
        let reviewed = files
            .iter()
            .filter(|file| file.state == ReviewState::Reviewed)
            .count();
        let state = if missing {
            ReviewState::Gone
        } else if current.is_some()
            && reviewed == fingerprints.len()
            && files.iter().all(|file| file.state == ReviewState::Reviewed)
            && (reviewed > 0 || marks.whole.is_some())
            && whole_description_matches
        {
            ReviewState::Reviewed
        } else {
            ReviewState::Changed
        };
        changes.push(ChangeReview {
            change_id,
            commit_id: current_id,
            reviewed_commit_id: marks.whole,
            state,
            total: fingerprints.len(),
            reviewed,
            files,
        });
    }
    Ok(ReviewProgress {
        me,
        location: store.location().display().to_string(),
        changes,
    })
}

#[cfg(test)]
mod tests {
    use super::canonical_text_diff;

    #[test]
    fn diff_identity_ignores_unrelated_upstream_lines_but_retains_context() {
        let before = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n";
        let after = before.replace("eight", "EIGHT");
        let original = canonical_text_diff(before.as_bytes(), after.as_bytes()).unwrap();
        let rebased_before = format!("upstream\n{before}");
        let rebased_after = format!("upstream\n{after}");
        assert_eq!(
            original,
            canonical_text_diff(rebased_before.as_bytes(), rebased_after.as_bytes()).unwrap()
        );
        let moved = before.replace("two", "TWO");
        assert_ne!(
            original,
            canonical_text_diff(before.as_bytes(), moved.as_bytes()).unwrap()
        );
        let context = before.replace("seven", "another context");
        let changed = context.replace("eight", "EIGHT");
        assert_ne!(
            original,
            canonical_text_diff(context.as_bytes(), changed.as_bytes()).unwrap()
        );
    }

    #[test]
    fn repeated_context_keeps_positions_to_avoid_reusing_another_occurrences_review() {
        let block = "one\ntwo\nthree\nfour\nfive\nsix\nseven\n";
        let before = format!("{block}{block}");
        let first = before.replacen("four", "FOUR", 1);
        let second = format!("{block}{}", block.replace("four", "FOUR"));
        assert_ne!(
            canonical_text_diff(before.as_bytes(), first.as_bytes()).unwrap(),
            canonical_text_diff(before.as_bytes(), second.as_bytes()).unwrap()
        );
    }

    #[test]
    fn binary_is_never_compared_as_lossy_text() {
        assert!(canonical_text_diff(b"a\0b", b"a\0c").unwrap().is_none());
        assert!(canonical_text_diff(b"\xff", b"\xfe").unwrap().is_none());
    }
}
