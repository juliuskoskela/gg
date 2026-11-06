//! `gg annotations`: read and answer notes without opening the app, so an
//! agent can reply in the exact context a person asked about.

use std::io::{IsTerminal as _, Read as _};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use jj_lib::settings::UserSettings;

use super::{AnnotationStore, describe_anchor, export_markdown, short_id};
use crate::messages::annotations::{
    AnnotationAuthor, AnnotationStatus, AnnotationThread, AuthorKind,
};

#[derive(clap::Subcommand, Debug)]
pub enum Action {
    /// List notes, newest activity first.
    List {
        /// Include resolved notes.
        #[arg(long)]
        all: bool,
        /// Print JSON instead of a table.
        #[arg(long)]
        json: bool,
    },
    /// Show a note and its replies as markdown.
    Show {
        /// Note id or a unique prefix of it.
        id: String,
        #[arg(long)]
        json: bool,
    },
    /// Print notes as markdown, ready to paste into a conversation. Without ids, prints all open notes.
    Export { ids: Vec<String> },
    /// Reply to a note. Reads the reply from standard input when TEXT is omitted or "-".
    Reply {
        id: String,
        text: Option<String>,
        /// Reply as an agent with this name, instead of as your jj user.
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Mark a note as resolved.
    Resolve {
        id: String,
        #[arg(long)]
        agent: Option<String>,
    },
    /// Reopen a resolved note.
    Reopen {
        id: String,
        #[arg(long)]
        agent: Option<String>,
    },
}

pub fn run(workspace: Option<&Path>, settings: &UserSettings, action: Action) -> Result<()> {
    let store = open(workspace)?;
    let author = |agent: Option<String>| author(settings, agent);
    match action {
        Action::List { all, json } => {
            let threads: Vec<AnnotationThread> = store
                .list()?
                .into_iter()
                .filter(|thread| all || thread.status == AnnotationStatus::Open)
                .collect();
            if json {
                println!("{}", serde_json::to_string_pretty(&threads)?);
            } else if threads.is_empty() {
                println!(
                    "No {}notes. Stored in {}",
                    if all { "" } else { "open " },
                    store.location().display()
                );
            } else {
                for thread in &threads {
                    print_row(thread);
                }
            }
        }
        Action::Show { id, json } => {
            let thread = store.get(&id)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&thread)?);
            } else {
                print!("{}", export_markdown(&[thread]));
            }
        }
        Action::Export { ids } => {
            let threads = if ids.is_empty() {
                store
                    .list()?
                    .into_iter()
                    .filter(|thread| thread.status == AnnotationStatus::Open)
                    .collect()
            } else {
                ids.iter()
                    .map(|id| store.get(id))
                    .collect::<Result<Vec<_>>>()?
            };
            if threads.is_empty() {
                bail!("No open notes to export.");
            }
            print!("{}", export_markdown(&threads));
        }
        Action::Reply {
            id,
            text,
            agent,
            json,
        } => {
            let body = match text.as_deref() {
                Some("-") | None => read_stdin()?,
                Some(text) => text.to_owned(),
            };
            let thread = store.reply(&id, author(agent), &body)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&thread)?);
            } else {
                println!("Replied to note {}.", short_id(&thread.id));
            }
        }
        Action::Resolve { id, agent } => {
            let thread = store.set_status(&id, author(agent), AnnotationStatus::Resolved)?;
            println!("Resolved note {}.", short_id(&thread.id));
        }
        Action::Reopen { id, agent } => {
            let thread = store.set_status(&id, author(agent), AnnotationStatus::Open)?;
            println!("Reopened note {}.", short_id(&thread.id));
        }
    }
    Ok(())
}

fn open(workspace: Option<&Path>) -> Result<AnnotationStore> {
    let start = match workspace {
        Some(path) => path.to_path_buf(),
        None => std::env::current_dir()?,
    };
    let start = dunce::canonicalize(&start).unwrap_or(start);
    let root: PathBuf = start
        .ancestors()
        .find(|path| path.join(".jj").is_dir())
        .ok_or_else(|| anyhow!("{} is not inside a jj workspace", start.display()))?
        .to_path_buf();
    AnnotationStore::for_workspace(&root)
}

fn author(settings: &UserSettings, agent: Option<String>) -> AnnotationAuthor {
    match agent {
        Some(name) if !name.trim().is_empty() => AnnotationAuthor {
            name: name.trim().to_owned(),
            kind: AuthorKind::Agent,
        },
        _ => {
            let name = settings.user_name();
            AnnotationAuthor {
                name: if name.trim().is_empty() {
                    "You".to_owned()
                } else {
                    name.to_owned()
                },
                kind: AuthorKind::Human,
            }
        }
    }
}

fn read_stdin() -> Result<String> {
    let mut stdin = std::io::stdin();
    if stdin.is_terminal() {
        eprintln!("Write your reply, then press Ctrl-D.");
    }
    let mut body = String::new();
    stdin
        .read_to_string(&mut body)
        .context("Reading the reply")?;
    Ok(body)
}

fn print_row(thread: &AnnotationThread) {
    let first = thread.posts[0]
        .body
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("");
    let summary: String = first.chars().take(72).collect();
    let replies = thread.posts.len() - 1;
    println!(
        "{}  {}{}\n          {}{}",
        short_id(&thread.id),
        summary,
        if first.chars().count() > 72 {
            "…"
        } else {
            ""
        },
        describe_anchor(&thread.anchor).replace('`', ""),
        match (replies, thread.status) {
            (0, AnnotationStatus::Open) => String::new(),
            (0, AnnotationStatus::Resolved) => " · resolved".to_owned(),
            (n, status) => format!(
                " · {n} {}{}",
                if n == 1 { "reply" } else { "replies" },
                if status == AnnotationStatus::Resolved {
                    ", resolved"
                } else {
                    ""
                }
            ),
        }
    );
}
