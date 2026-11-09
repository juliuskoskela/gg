use anyhow::{Result, anyhow};
use jj_lib::{
    backend::CommitId,
    matchers::{EverythingMatcher, FilesMatcher, Matcher},
    merge::Diff,
    repo::Repo as _,
    repo_path::RepoPath,
    rewrite,
};

use super::{WorkspaceSession, categories::FileCategories, queries};
use crate::messages::review_delta::{ReviewDelta, ReviewDeltaRequest};

pub async fn compare(
    ws: &WorkspaceSession<'_>,
    request: ReviewDeltaRequest,
) -> Result<ReviewDelta> {
    let unavailable = |reason: &str| ReviewDelta::Unavailable {
        reason: reason.into(),
    };
    let from_id = CommitId::try_from_hex(&request.from.commit.hex)
        .ok_or_else(|| anyhow!("invalid earlier commit ID"))?;
    let to_id = CommitId::try_from_hex(&request.to.commit.hex)
        .ok_or_else(|| anyhow!("invalid later commit ID"))?;
    let store = ws.repo().store();
    let (Ok(from), Ok(to)) = (store.get_commit(&from_id), store.get_commit(&to_id)) else {
        return Ok(unavailable(
            "One of these versions is no longer available locally. It may have been garbage-collected.",
        ));
    };
    if from.change_id().reverse_hex() != request.from.change.hex
        || to.change_id().reverse_hex() != request.to.change.hex
    {
        return Ok(unavailable("Choose two versions of the same change."));
    }
    if from.change_id() != to.change_id() {
        let mapped = if let Some(path) = &request.path {
            super::splits::follows_owner(ws, &request.from, &request.to, path).await?
        } else {
            false
        };
        if !mapped {
            return Ok(unavailable(
                "Choose two versions of the same change or a recorded split file.",
            ));
        }
    }
    let matcher: Box<dyn Matcher> = if let Some(path) = &request.path {
        Box::new(FilesMatcher::new([RepoPath::from_internal_string(path)?]))
    } else {
        Box::new(EverythingMatcher)
    };
    // use the same counterfactual as jj interdiff; parent edits are not author edits.
    let earlier =
        rewrite::rebase_to_dest_parent(ws.repo(), std::slice::from_ref(&from), &to).await?;
    let later = to.tree();
    let original = from.tree();
    for tree in [&original, &earlier, &later] {
        if tree.conflicts_matching(matcher.as_ref()).next().is_some() {
            return Ok(unavailable(
                "The versions cannot be compared cleanly on the same parents. Resolve conflicts or inspect each version’s patch.",
            ));
        }
    }
    let mut changes = Vec::new();
    let mut categories = FileCategories::new(&later);
    queries::format_tree_changes(
        ws,
        &mut changes,
        earlier.diff_stream(&later, matcher.as_ref()),
        Diff::new(earlier.labels(), later.labels()),
        if request.full_context { usize::MAX } else { 3 },
        &mut categories,
    )
    .await?;
    Ok(ReviewDelta::Ready {
        changes,
        description_before: from.description().into(),
        description_after: to.description().into(),
        rebased: from.parent_ids() != to.parent_ids(),
    })
}
