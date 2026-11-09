//! `gg annotations`: read and write notes without opening the app, so an
//! agent can reply in the exact context a person asked about.

use std::io::{IsTerminal as _, Read as _};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use pollster::FutureExt as _;

use anyhow::{Context, Result, anyhow, bail};
use jj_lib::settings::UserSettings;

use super::{AnnotationStore, describe_anchor, export_markdown, short_id};
use crate::messages::annotation_agents::{AgentIdentity, AgentRiskScore, AnnotationMetadata};
use crate::messages::annotations::{
    AnnotationAuthor, AnnotationStatus, AnnotationThread, AuthorKind, LineSide,
};

#[derive(clap::Subcommand, Debug)]
pub enum Action {
    /// Start a thread at one retained revision, bookmark, file or line range.
    Create {
        text: Option<String>,
        /// Revision or revset resolving to one commit (defaults to @).
        #[arg(long, alias = "change", conflicts_with = "bookmark")]
        revision: Option<String>,
        /// Exact local bookmark name.
        #[arg(long)]
        bookmark: Option<String>,
        /// File path relative to the workspace root.
        #[arg(long)]
        file: Option<String>,
        /// One line or inclusive START-END range in the retained file.
        #[arg(long, requires = "file")]
        lines: Option<String>,
        /// Side of the revision diff to read the file from.
        #[arg(long, default_value = "new", value_parser = ["old", "new"])]
        side: String,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Edit your opening text, or a specific post selected with --post.
    Edit {
        id: String,
        text: Option<String>,
        /// Exact post id or unique prefix; defaults to the opening post.
        #[arg(long)]
        post: Option<String>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
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
        /// Model used by the agent (recorded as attribution, not verified).
        #[arg(long, requires = "agent")]
        model: Option<String>,
        /// Agent-reported risk: 1 low, 2 typical, 3 high, 4 very high.
        #[arg(long, requires = "agent", value_parser = clap::value_parser!(u8).range(1..=4))]
        risk_level: Option<u8>,
        /// Optional 40-character Git SHA to which the risk score applies.
        #[arg(long, requires = "risk_level")]
        risk_sha: Option<String>,
        /// Repeat for up to eight short reasons for the risk score.
        #[arg(long, requires = "risk_level")]
        risk_explanation: Vec<String>,
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
        Action::Create {
            text,
            revision,
            bookmark,
            file,
            lines,
            side,
            agent,
            json,
        } => {
            let root = workspace_root(workspace)?;
            let mut session = crate::worker::WorkerSession::new(
                Arc::new(SilentSink),
                Some(root.clone()),
                settings.clone(),
                false,
                false,
            );
            let ws = session.load_workspace_readonly(&root).block_on()?;
            let target = crate::worker::annotation_targets::resolve(
                &ws,
                crate::worker::annotation_targets::TargetQuery {
                    revision: revision.as_deref().unwrap_or("@"),
                    bookmark: bookmark.as_deref(),
                    file: file.as_deref(),
                    lines: lines.as_deref(),
                    side: if side == "old" {
                        LineSide::Old
                    } else {
                        LineSide::New
                    },
                },
            )
            .block_on()?;
            let body = read_body(text)?;
            let thread = store.create(vec![target], ws.name().as_str(), author(agent), &body)?;
            print_result(&thread, json, "Created")?;
        }
        Action::Edit {
            id,
            text,
            post,
            agent,
            json,
        } => {
            let thread = store.get(&id)?;
            let post = match post {
                None => thread
                    .posts
                    .first()
                    .context("The thread has no opening post")?
                    .id
                    .clone(),
                Some(prefix) => {
                    let matches: Vec<_> = thread
                        .posts
                        .iter()
                        .filter(|post| post.id.starts_with(&prefix))
                        .collect();
                    let [post] = matches.as_slice() else {
                        bail!("The post id must identify one post in this thread");
                    };
                    post.id.clone()
                }
            };
            let thread = store.edit(&id, &post, author(agent), &read_body(text)?)?;
            print_result(&thread, json, "Edited")?;
        }
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
            model,
            risk_level,
            risk_sha,
            risk_explanation,
            json,
        } => {
            let body = read_body(text)?;
            let identity = author(agent.clone());
            let metadata = agent.map(|agent| AnnotationMetadata {
                on_behalf_of: Some(AgentIdentity {
                    agent: agent.trim().to_owned(),
                    model,
                }),
                risk_score: risk_level.map(|level| AgentRiskScore {
                    level,
                    sha: risk_sha,
                    explanations: (!risk_explanation.is_empty()).then_some(risk_explanation),
                }),
            });
            let thread = store.reply_with_metadata(&id, identity, &body, metadata)?;
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

struct SilentSink;
impl crate::worker::EventSink for SilentSink {
    fn send(&self, _event_name: &str, _payload: serde_json::Value) {}
}

fn print_result(thread: &AnnotationThread, json: bool, action: &str) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(thread)?);
    } else {
        println!("{action} note {}.", short_id(&thread.id));
    }
    Ok(())
}

fn read_body(text: Option<String>) -> Result<String> {
    match text.as_deref() {
        Some("-") | None => read_stdin(),
        Some(text) => Ok(text.to_owned()),
    }
}

fn open(workspace: Option<&Path>) -> Result<AnnotationStore> {
    AnnotationStore::for_workspace(&workspace_root(workspace)?)
}

fn workspace_root(workspace: Option<&Path>) -> Result<PathBuf> {
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
    Ok(root)
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
        eprintln!("Write your text, then press Ctrl-D.");
    }
    let mut body = String::new();
    stdin
        .read_to_string(&mut body)
        .context("Reading annotation text")?;
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
    let place = describe_anchor(&thread.targets[0].anchor).replace('`', "")
        + &match thread.targets.len() {
            1 => String::new(),
            n => format!(" and {} more", n - 1),
        };
    println!(
        "{}  {}{}\n          {}{}",
        short_id(&thread.id),
        summary,
        if first.chars().count() > 72 {
            "…"
        } else {
            ""
        },
        place,
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

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;
    #[derive(Parser)]
    struct Arguments {
        #[command(subcommand)]
        action: Action,
    }
    #[test]
    fn reply_keeps_agent_syntax_and_validates_dependent_flags() {
        assert!(
            Arguments::try_parse_from(["gg", "reply", "note", "--agent", "codex", "answer"])
                .is_ok()
        );
        assert!(
            Arguments::try_parse_from(["gg", "reply", "note", "--model", "gpt-test", "answer"])
                .is_err()
        );
        assert!(
            Arguments::try_parse_from([
                "gg",
                "reply",
                "note",
                "--agent",
                "codex",
                "--risk-level",
                "5",
                "answer"
            ])
            .is_err()
        );
        assert!(
            Arguments::try_parse_from([
                "gg",
                "reply",
                "note",
                "--agent",
                "codex",
                "--risk-explanation",
                "reason",
                "answer"
            ])
            .is_err()
        );
        assert!(
            Arguments::try_parse_from([
                "gg",
                "reply",
                "note",
                "--agent",
                "codex",
                "--model",
                "gpt-test",
                "--risk-level",
                "3",
                "--risk-explanation",
                "reason",
                "answer"
            ])
            .is_ok()
        );
    }
    #[test]
    fn authoring_accepts_default_revision_and_rejects_ambiguous_target_flags() {
        assert!(Arguments::try_parse_from(["gg", "create", "A note"]).is_ok());
        assert!(
            Arguments::try_parse_from(["gg", "create", "--bookmark", "main", "A note"]).is_ok()
        );
        assert!(Arguments::try_parse_from(["gg", "create", "--lines", "1-2", "A note"]).is_err());
        assert!(
            Arguments::try_parse_from([
                "gg",
                "create",
                "--revision",
                "@",
                "--bookmark",
                "main",
                "A note"
            ])
            .is_err()
        );
        assert!(
            Arguments::try_parse_from(["gg", "edit", "note", "--post", "post-prefix", "Edited"])
                .is_ok()
        );
    }
}
