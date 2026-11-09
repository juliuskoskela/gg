//! PTY ownership shared by the desktop and web transports.

mod prompt;

use std::io::{Read, Write};
use std::path::Path;
use std::sync::mpsc::{SyncSender, sync_channel};
use std::thread;

use anyhow::{Context, Result, bail};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tokio::sync::mpsc;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Output {
    Data { data: Vec<u8> },
    Exit { code: Option<u32> },
    Error { message: String },
}

pub struct Terminal {
    master: Box<dyn MasterPty + Send>,
    input: SyncSender<Vec<u8>>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    _startup: Option<tempfile::TempDir>,
}

impl Terminal {
    pub fn open(directory: &Path, cols: u16, rows: u16) -> Result<(Self, mpsc::Receiver<Output>)> {
        let shell = std::env::var_os(if cfg!(windows) { "COMSPEC" } else { "SHELL" })
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| if cfg!(windows) { "cmd.exe" } else { "/bin/sh" }.into());
        let mut command = CommandBuilder::new(&shell);
        command.cwd(directory);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        // a development launcher may export a prompt belonging to a different shell.
        for variable in ["PS1", "PS2", "PROMPT", "PROMPT2", "RPROMPT", "RPS1"] {
            command.env_remove(variable);
        }
        let startup = prompt::configure(&mut command, &shell)?;
        let (mut terminal, output) = Self::spawn(command, cols, rows)?;
        terminal._startup = startup;
        Ok((terminal, output))
    }

    fn spawn(
        command: CommandBuilder,
        cols: u16,
        rows: u16,
    ) -> Result<(Self, mpsc::Receiver<Output>)> {
        let pair = portable_pty::native_pty_system().openpty(size(cols, rows)?)?;
        let mut reader = pair.master.try_clone_reader()?;
        let mut writer = pair.master.take_writer()?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .context("Could not start the shell")?;
        drop(pair.slave);
        let killer = child.clone_killer();
        // bounded output prevents a noisy command from exhausting the application's memory.
        let (tx, rx) = mpsc::channel(32);
        let (input, writes) = sync_channel::<Vec<u8>>(32);
        let errors = tx.clone();
        // a program that stops reading must not block window cleanup or other terminals.
        thread::spawn(move || {
            while let Ok(data) = writes.recv() {
                if let Err(error) = writer.write_all(&data).and_then(|()| writer.flush()) {
                    let _ = errors.blocking_send(Output::Error {
                        message: error.to_string(),
                    });
                    break;
                }
            }
        });
        thread::spawn(move || {
            let mut buffer = [0; 16 * 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        if tx
                            .blocking_send(Output::Data {
                                data: buffer[..count].to_vec(),
                            })
                            .is_err()
                        {
                            let _ = child.kill();
                            break;
                        }
                    }
                    // Linux PTYs report EIO when the slave closes.
                    Err(error) if error.raw_os_error() == Some(5) => break,
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(error) => {
                        let _ = tx.blocking_send(Output::Error {
                            message: error.to_string(),
                        });
                        let _ = child.kill();
                        break;
                    }
                }
            }
            let code = child.wait().ok().map(|status| status.exit_code());
            let _ = tx.blocking_send(Output::Exit { code });
        });
        Ok((
            Self {
                master: pair.master,
                input,
                killer,
                _startup: None,
            },
            rx,
        ))
    }

    pub fn input(&mut self, data: &[u8]) -> Result<()> {
        if data.len() > 64 * 1024 {
            bail!("Terminal input is too large");
        }
        self.input
            .try_send(data.to_vec())
            .context("Terminal input queue is full or the shell has exited")?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.master.resize(size(cols, rows)?)
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = self.killer.kill();
    }
}

fn size(cols: u16, rows: u16) -> Result<PtySize> {
    if !(2..=500).contains(&cols) || !(1..=200).contains(&rows) {
        bail!("Terminal dimensions must be 2–500 columns and 1–200 rows");
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn shell_has_a_pty_working_directory_and_resizes() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (mut terminal, mut output) = Terminal::open(directory.path(), 80, 24)?;
        terminal.resize(97, 31)?;
        terminal.input(b"printf '\\nGG_PTY:'; pwd; stty size; exit 7\n")?;
        let mut bytes = Vec::new();
        let code = tokio::time::timeout(std::time::Duration::from_secs(10), async {
            while let Some(event) = output.recv().await {
                match event {
                    Output::Data { data } => bytes.extend(data),
                    Output::Exit { code } => return code,
                    Output::Error { message } => panic!("{message}"),
                }
            }
            None
        })
        .await?;
        let text = String::from_utf8_lossy(&bytes);
        assert!(
            text.contains(&*directory.path().to_string_lossy()),
            "{text}"
        );
        assert!(text.contains("31 97"), "{text}");
        assert_eq!(code, Some(7));
        Ok(())
    }

    #[tokio::test]
    async fn dropping_terminal_ends_shell_and_output() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let (terminal, mut output) = Terminal::open(directory.path(), 80, 24)?;
        drop(terminal);
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while output.recv().await.is_some() {}
        })
        .await?;
        Ok(())
    }

    #[test]
    fn rejects_unbounded_dimensions() {
        assert!(size(0, 24).is_err());
        assert!(size(80, 201).is_err());
        assert!(size(501, 24).is_err());
    }
}
