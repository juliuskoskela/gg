//! Handlers for local annotations, which change notes outside the repository

use std::sync::mpsc::channel;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    routing::post,
};
use serde::Deserialize;

use crate::messages::annotations::{AnnotationList, AnnotationRequest};
use crate::messages::plugins::{PluginData, PluginRequest};
use crate::worker::SessionEvent;

use super::ApiError;
use super::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/annotations", post(annotations))
        .route(
            "/plugin_notes",
            post(plugin_notes).layer(DefaultBodyLimit::max(11 * 1024 * 1024)),
        )
        .route("/review_progress", post(review_progress))
        .route("/export_annotations", post(export_annotations))
        .route(
            "/plugin_data",
            post(plugin_data).layer(DefaultBodyLimit::max(5 * 1024 * 1024)),
        )
}

#[derive(Deserialize)]
struct Annotations {
    request: AnnotationRequest,
}

async fn annotations(
    State(state): State<AppState>,
    Json(req): Json<Annotations>,
) -> Result<Json<AnnotationList>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::Annotations {
        tx,
        request: req.request,
    })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct ExportAnnotations {
    ids: Vec<String>,
}

async fn export_annotations(
    State(state): State<AppState>,
    Json(req): Json<ExportAnnotations>,
) -> Result<Json<String>, ApiError> {
    let (tx, rx) = channel();
    state
        .worker_tx
        .send(SessionEvent::ExportAnnotations { tx, ids: req.ids })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct ReviewProgressRequest {
    request: crate::messages::review::ReviewRequest,
}

async fn review_progress(
    State(state): State<AppState>,
    Json(req): Json<ReviewProgressRequest>,
) -> Result<Json<crate::messages::review::ReviewProgress>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::ReviewProgress {
        tx,
        request: req.request,
    })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct PluginDataRequest {
    request: PluginRequest,
}

async fn plugin_data(
    State(state): State<AppState>,
    Json(req): Json<PluginDataRequest>,
) -> Result<Json<PluginData>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::PluginData {
        tx,
        request: req.request,
    })?;
    Ok(Json(rx.recv()??))
}

#[derive(Deserialize)]
struct PluginNotes {
    request: crate::messages::annotation_exchange::PluginNotesRequest,
}

async fn plugin_notes(
    State(state): State<AppState>,
    Json(req): Json<PluginNotes>,
) -> Result<Json<crate::messages::annotation_exchange::PluginNotesResponse>, ApiError> {
    let (tx, rx) = channel();
    state.worker_tx.send(SessionEvent::PluginNotes {
        tx,
        request: req.request,
    })?;
    Ok(Json(rx.recv()??))
}
