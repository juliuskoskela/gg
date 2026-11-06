//! Typed handlers for web mode queries

use std::path::PathBuf;
use std::sync::mpsc::channel;

use axum::{Json, Router, extract::State, routing::post};
use serde::Deserialize;

use crate::messages::{
    RepoConfig, RepoStatus, RevSet,
    queries::{LogPage, RevisionDiffResult, RevisionSummaryResult, RevsResult, WorkspaceContext},
};
use crate::worker::SessionEvent;

use super::ApiError;
use super::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/query_workspace", post(query_workspace))
        .route("/query_workspace_identity", post(query_workspace_identity))
        .route("/query_workspace_context", post(query_workspace_context))
        .route("/query_log", post(query_log))
        .route("/query_log_next_page", post(query_log_next_page))
        .route("/query_revisions", post(query_revisions))
        .route("/query_evolution", post(query_evolution))
        .route("/query_operation_history", post(query_operation_history))
        .route("/query_operation_detail", post(query_operation_detail))
        .route("/query_revision_summary", post(query_revision_summary))
        .route(
            "/resolve_revision_selection",
            post(resolve_revision_selection),
        )
        .route("/query_revision_diff", post(query_revision_diff))
        .route(
            "/query_operation_preflight",
            post(query_operation_preflight),
        )
        .route("/query_remotes", post(query_remotes))
        .route("/query_recent_workspaces", post(query_recent_workspaces))
        .route("/query_snapshot", post(query_snapshot))
        .route("/query_current_status", post(query_current_status))
}

#[derive(Deserialize)]
pub struct QueryWorkspace {
    path: Option<String>,
}

async fn query_workspace(
    State(state): State<AppState>,
    Json(req): Json<QueryWorkspace>,
) -> Result<Json<RepoConfig>, ApiError> {
    let path = req.path.map(PathBuf::from);
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::OpenWorkspace {
        tx,
        wd: path.clone(),
    })?;

    let config = match rx.recv()? {
        Ok(config) => {
            log::debug!("load workspace succeeded");
            config
        }
        Err(err) => {
            log::warn!("load workspace failed: {err}");
            RepoConfig::LoadError {
                absolute_path: path.unwrap_or_default().into(),
                message: format!("{:#}", err),
            }
        }
    };

    Ok(Json(config))
}

async fn query_workspace_identity(State(state): State<AppState>) -> Result<Json<String>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryWorkspaceIdentity { tx })?;
    Ok(Json(rx.recv()??))
}

async fn query_workspace_context(
    State(state): State<AppState>,
) -> Result<Json<WorkspaceContext>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryWorkspaceContext { tx })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
pub struct QueryLog {
    revset: String,
}

async fn query_log(
    State(state): State<AppState>,
    Json(req): Json<QueryLog>,
) -> Result<Json<LogPage>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::QueryLog {
        tx,
        query: req.revset,
    })?;
    let result = rx.recv()??;
    Ok(Json(result))
}

async fn query_log_next_page(State(state): State<AppState>) -> Result<Json<LogPage>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryLogNextPage { tx })?;
    let result = rx.recv()??;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct QueryRevisions {
    set: RevSet,
}

async fn query_revisions(
    State(state): State<AppState>,
    Json(req): Json<QueryRevisions>,
) -> Result<Json<RevsResult>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryRevisions { tx, set: req.set })?;
    let result = rx.recv()??;
    Ok(Json(result))
}

#[derive(Deserialize)]
struct QueryOperationPreflight {
    redo: bool,
}
async fn query_operation_preflight(
    State(state): State<AppState>,
    Json(req): Json<QueryOperationPreflight>,
) -> Result<Json<crate::messages::queries::OperationPreflight>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryOperationPreflight { tx, redo: req.redo })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct ResolveRevisionSelection {
    id: crate::messages::RevId,
}
async fn resolve_revision_selection(
    State(state): State<AppState>,
    Json(req): Json<ResolveRevisionSelection>,
) -> Result<Json<crate::messages::queries::RevisionSelectionResult>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::ResolveRevisionSelection { tx, id: req.id })?;
    Ok(Json(rx.recv()??))
}

async fn query_revision_summary(
    State(state): State<AppState>,
    Json(req): Json<QueryRevisions>,
) -> Result<Json<RevisionSummaryResult>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryRevisionSummary { tx, set: req.set })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct QueryRevisionDiff {
    set: RevSet,
    path: crate::messages::TreePath,
    #[serde(default, alias = "fullContext")]
    full_context: bool,
}
async fn query_revision_diff(
    State(state): State<AppState>,
    Json(req): Json<QueryRevisionDiff>,
) -> Result<Json<RevisionDiffResult>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::QueryRevisionDiff {
        tx,
        set: req.set,
        path: req.path,
        full_context: req.full_context,
    })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
pub struct QueryRemotes {
    tracking_bookmark: Option<String>,
}

async fn query_remotes(
    State(state): State<AppState>,
    Json(req): Json<QueryRemotes>,
) -> Result<Json<Vec<String>>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::QueryRemotes {
        tx,
        tracking_bookmark: req.tracking_bookmark,
    })?;
    let result = rx.recv()??;
    Ok(Json(result))
}

async fn query_recent_workspaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<String>>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::ReadConfigArray {
        tx,
        key: vec!["gg".into(), "ui".into(), "recent-workspaces".into()],
    })?;
    let result = rx.recv()?.unwrap_or_default();
    Ok(Json(result))
}

async fn query_snapshot(
    State(state): State<AppState>,
) -> Result<Json<Option<RepoStatus>>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::ExecuteSnapshot { tx })?;
    let result = rx.recv()?;
    Ok(Json(result))
}

async fn query_current_status(State(state): State<AppState>) -> Result<Json<RepoStatus>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryCurrentStatus { tx })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct QueryEvolution {
    id: crate::messages::RevId,
    #[serde(default)]
    offset: usize,
}
async fn query_evolution(
    State(state): State<AppState>,
    Json(req): Json<QueryEvolution>,
) -> Result<Json<crate::messages::queries::EvolutionPage>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::QueryEvolution {
        tx,
        id: req.id,
        offset: req.offset,
    })?;
    Ok(Json(rx.recv()??))
}
#[derive(Deserialize)]
struct QueryOperationHistory {
    head: Option<String>,
    #[serde(default)]
    offset: usize,
}
async fn query_operation_history(
    State(state): State<AppState>,
    Json(req): Json<QueryOperationHistory>,
) -> Result<Json<crate::messages::queries::OperationPage>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::QueryOperationHistory {
        tx,
        head: req.head,
        offset: req.offset,
    })?;
    Ok(Json(rx.recv()??))
}
#[derive(Deserialize)]
struct QueryOperationDetail {
    id: String,
}
async fn query_operation_detail(
    State(state): State<AppState>,
    Json(req): Json<QueryOperationDetail>,
) -> Result<Json<crate::messages::queries::OperationDetail>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::QueryOperationDetail { tx, id: req.id })?;
    Ok(Json(rx.recv()??))
}
