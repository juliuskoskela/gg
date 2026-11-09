//! Handlers for local annotations, which change notes outside the repository

use std::sync::mpsc::channel;

use axum::{Json, Router, extract::State, routing::post};
use serde::Deserialize;

use crate::messages::annotations::{AnnotationList, AnnotationRequest};
use crate::worker::SessionEvent;

use super::ApiError;
use super::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/annotations", post(annotations))
        .route("/review_progress", post(review_progress))
        .route("/export_annotations", post(export_annotations))
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
