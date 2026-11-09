use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, mpsc::channel};

use anyhow::{Result, anyhow, bail};
use gg_lib::terminal::{Output, Terminal};
use gg_lib::worker::SessionEvent;
use tauri::{Manager, State, Window, ipc::Channel};

use super::AppState;

type Sessions = HashMap<(String, String), Terminal>;

#[derive(Clone, Default)]
pub(super) struct Terminals(Arc<Mutex<Sessions>>);

impl Terminals {
    pub(super) fn close_window(&self, owner: &str) {
        self.0
            .lock()
            .unwrap()
            .retain(|(window, _), _| window != owner);
    }
}

#[tauri::command(async)]
pub(super) fn terminal_open(
    window: Window,
    app_state: State<AppState>,
    terminals: State<Terminals>,
    directory: String,
    output: Channel<Output>,
) -> Result<String, String> {
    let open = || -> Result<String> {
        let (tx, rx) = channel();
        app_state
            .get_session(window.label())
            .send(SessionEvent::QueryWorkspaceContext { tx })?;
        let workspace = rx.recv()??;
        if directory != workspace.workspace_path.0 {
            bail!("The workspace changed; reopen the terminal");
        }
        let mut sessions = terminals.0.lock().unwrap();
        if sessions
            .keys()
            .filter(|(owner, _)| owner == window.label())
            .count()
            >= 4
        {
            bail!("This window already has four terminal sessions");
        }
        let (terminal, mut events) = Terminal::open(Path::new(&directory), 80, 24)?;
        let id = uuid::Uuid::new_v4().to_string();
        let key = (window.label().to_owned(), id.clone());
        sessions.insert(key.clone(), terminal);
        let terminals = terminals.inner().clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                let exited = matches!(event, Output::Exit { .. });
                if output.send(event).is_err() || exited {
                    break;
                }
            }
            terminals.0.lock().unwrap().remove(&key);
        });
        Ok(id)
    };
    open().map_err(|error| format!("{error:#}"))
}

#[tauri::command(async)]
pub(super) fn terminal_input(
    window: Window,
    terminals: State<Terminals>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = terminals.0.lock().unwrap();
    sessions
        .get_mut(&(window.label().to_owned(), id))
        .ok_or_else(|| anyhow!("Terminal session has ended"))
        .and_then(|terminal| terminal.input(&data))
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(super) fn terminal_resize(
    window: Window,
    terminals: State<Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = terminals.0.lock().unwrap();
    sessions
        .get(&(window.label().to_owned(), id))
        .ok_or_else(|| anyhow!("Terminal session has ended"))
        .and_then(|terminal| terminal.resize(cols, rows))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(super) fn terminal_close(window: Window, terminals: State<Terminals>, id: String) {
    terminals
        .0
        .lock()
        .unwrap()
        .remove(&(window.label().to_owned(), id));
}

pub(super) fn close_window(window: &Window) {
    window.state::<Terminals>().close_window(window.label());
}
