use anyhow::{Result, anyhow};
use futures_util::TryStreamExt as _;
use jj_lib::{
    commit::Commit, object_id::ObjectId as _, repo::Repo as _, repo_path::RepoPath,
    revset::RevsetStreamExt as _,
};
use pollster::FutureExt as _;

use super::WorkspaceSession;
use super::mutations::read_file_content;
use crate::annotations::{self, AnnotationStore};
use crate::messages::annotations::{
    AnchorState, AnnotationAnchor, AnnotationAuthor, AnnotationList, AnnotationRequest,
    AnnotationThread, AuthorKind, LineSide,
};

fn store(ws: &WorkspaceSession) -> Result<AnnotationStore> {
    AnnotationStore::for_repo(ws.workspace.repo_path(), ws.workspace.workspace_root())
}

fn author(ws: &WorkspaceSession) -> AnnotationAuthor {
    let name = ws.data.workspace_settings.user_name();
    AnnotationAuthor {
        name: if name.trim().is_empty() {
            "You".to_owned()
        } else {
            name.to_owned()
        },
        kind: AuthorKind::Human,
    }
}

pub fn handle(ws: &WorkspaceSession, request: AnnotationRequest) -> Result<AnnotationList> {
    let store = store(ws)?;
    match request {
        AnnotationRequest::List => {}
        AnnotationRequest::Create { targets, body } => {
            store.create(targets, ws.name().as_str(), author(ws), &body)?;
        }
        AnnotationRequest::AddTargets { id, targets } => {
            store.add_targets(&id, author(ws), targets)?;
        }
        AnnotationRequest::RemoveTarget { id, anchor } => {
            store.remove_target(&id, author(ws), anchor)?;
        }
        AnnotationRequest::Reply { id, body } => {
            store.reply(&id, author(ws), &body)?;
        }
        AnnotationRequest::Edit { id, post, body } => {
            store.edit(&id, &post, author(ws), &body)?;
        }
        AnnotationRequest::SetStatus { id, status } => {
            store.set_status(&id, author(ws), status)?;
        }
        AnnotationRequest::Delete { ids } => {
            for id in ids {
                store.delete(&id)?;
            }
        }
    }
    let mut threads = store.list()?;
    for thread in &mut threads {
        for target in &mut thread.targets {
            target.state = anchor_state(ws, &target.anchor);
        }
    }
    Ok(AnnotationList {
        location: store.location().display().to_string(),
        me: author(ws),
        threads,
    })
}

pub fn export(ws: &WorkspaceSession, ids: Vec<String>) -> Result<String> {
    let store = store(ws)?;
    let mut threads: Vec<AnnotationThread> =
        ids.iter().map(|id| store.get(id)).collect::<Result<_>>()?;
    for thread in &mut threads {
        for target in &mut thread.targets {
            target.state = anchor_state(ws, &target.anchor);
        }
    }
    Ok(annotations::export_markdown(&threads))
}

fn visible_commits(ws: &WorkspaceSession, change_id: &str) -> Result<Vec<Commit>> {
    if !change_id.bytes().all(|b| b.is_ascii_lowercase()) {
        return Err(anyhow!("not a change id"));
    }
    let revset = ws.evaluate_revset_str(&format!("change_id({change_id})"))?;
    let commits = revset
        .as_ref()
        .stream()
        .commits(ws.repo().store())
        .try_collect::<Vec<_>>()
        .block_on()?;
    Ok(commits)
}

pub fn anchor_state(ws: &WorkspaceSession, anchor: &AnnotationAnchor) -> AnchorState {
    let commits = match visible_commits(ws, anchor.change_id()) {
        Ok(commits) if !commits.is_empty() => commits,
        Ok(_) => return AnchorState::Missing,
        Err(_) => return AnchorState::Unknown,
    };
    if commits
        .iter()
        .any(|commit| commit.id().hex() == anchor.commit_id())
    {
        return AnchorState::Current;
    }
    // divergent changes have no single successor to compare against
    let [current] = commits.as_slice() else {
        return AnchorState::Rewritten {
            commit_id: commits[0].id().hex(),
            matches: None,
        };
    };
    let matches = match anchor {
        AnnotationAnchor::Lines {
            path,
            side: LineSide::New,
            start,
            end,
            quote,
            ..
        } => quote_matches(ws, current, path, *start, *end, quote).ok(),
        _ => None,
    };
    AnchorState::Rewritten {
        commit_id: current.id().hex(),
        matches,
    }
}

fn quote_matches(
    ws: &WorkspaceSession,
    commit: &Commit,
    path: &str,
    start: u32,
    end: u32,
    quote: &str,
) -> Result<bool> {
    let path = RepoPath::from_internal_string(path)?;
    let tree = commit.tree();
    let content = read_file_content(ws.repo().store(), &tree, path).block_on()?;
    let text = String::from_utf8_lossy(&content);
    let lines: Vec<&str> = text
        .lines()
        .skip(start as usize - 1)
        .take((end - start + 1) as usize)
        .collect();
    Ok(lines.join("\n") == quote.lines().collect::<Vec<_>>().join("\n"))
}
