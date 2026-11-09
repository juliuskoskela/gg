use std::path::Path;
use std::sync::mpsc::channel;

use axum::extract::{
    Query, State, WebSocketUpgrade,
    ws::{Message, WebSocket},
};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use serde::Deserialize;

use super::state::AppState;
use crate::terminal::{Output, Terminal};
use crate::worker::SessionEvent;

#[derive(Deserialize)]
pub(super) struct Connect {
    token: String,
    directory: String,
}

// the token alone does not protect against DNS rebinding.
fn allowed_origin(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get("host").and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let hostname = host.split(':').next().unwrap_or_default();
    if hostname != "127.0.0.1" && hostname != "localhost" {
        return false;
    }
    let origin = headers.get("origin").and_then(|value| value.to_str().ok());
    origin == Some(format!("http://{host}").as_str())
}

pub(super) async fn connect(
    State(state): State<AppState>,
    Query(request): Query<Connect>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Result<Response, StatusCode> {
    if request.token != state.terminal_token || !allowed_origin(&headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let permit = state
        .terminal_slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    Ok(upgrade
        .max_message_size(64 * 1024)
        .on_upgrade(move |socket| async move {
            let _permit = permit;
            run(socket, state, request.directory).await;
        }))
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Input {
    Resize { cols: u16, rows: u16 },
}

async fn run(mut socket: WebSocket, state: AppState, directory: String) {
    let opened = tokio::task::spawn_blocking(move || -> anyhow::Result<_> {
        let (tx, rx) = channel();
        state
            .worker_tx
            .send(SessionEvent::QueryWorkspaceContext { tx })?;
        let context = rx.recv()??;
        anyhow::ensure!(
            directory == context.workspace_path.0,
            "The workspace changed; reopen the terminal"
        );
        Terminal::open(Path::new(&directory), 80, 24)
    })
    .await;
    let (mut terminal, mut output) = match opened {
        Ok(Ok(opened)) => opened,
        result => {
            let message = match result {
                Ok(Err(error)) => format!("{error:#}"),
                Err(error) => error.to_string(),
                _ => unreachable!(),
            };
            let event = Output::Error { message };
            let _ = socket
                .send(Message::Text(serde_json::to_string(&event).unwrap().into()))
                .await;
            return;
        }
    };
    if socket
        .send(Message::Text(r#"{"type":"ready"}"#.into()))
        .await
        .is_err()
    {
        return;
    }
    loop {
        tokio::select! {
            event = output.recv() => {
                let Some(event) = event else { break; };
                let exited = matches!(event, Output::Exit { .. });
                let message = match event {
                    Output::Data { data } => Message::Binary(data.into()),
                    event => Message::Text(serde_json::to_string(&event).unwrap().into()),
                };
                if socket.send(message).await.is_err() || exited { break; }
            }
            message = socket.recv() => {
                let result = match message {
                    Some(Ok(Message::Binary(data))) => terminal.input(&data),
                    Some(Ok(Message::Text(text))) => match serde_json::from_str::<Input>(&text) {
                        Ok(Input::Resize { cols, rows }) => terminal.resize(cols, rows),
                        Err(_) => break,
                    },
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                    _ => break,
                };
                if result.is_err() { break; }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_same_origin_and_loopback_host() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "127.0.0.1:6974".parse().unwrap());
        assert!(!allowed_origin(&headers));
        headers.insert("origin", "https://attacker.example".parse().unwrap());
        assert!(!allowed_origin(&headers));
        headers.insert("origin", "http://127.0.0.1:6974".parse().unwrap());
        assert!(allowed_origin(&headers));
        headers.insert("host", "attacker.example:6974".parse().unwrap());
        headers.insert("origin", "http://attacker.example:6974".parse().unwrap());
        assert!(!allowed_origin(&headers));
    }
}
