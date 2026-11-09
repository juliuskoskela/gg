use std::ffi::OsStr;
use std::path::Path;

use anyhow::Result;
use portable_pty::CommandBuilder;
use tempfile::TempDir;

// bootstrap after user configuration so prompt themes cannot replace the compact prompt.
pub(super) fn configure(command: &mut CommandBuilder, shell: &OsStr) -> Result<Option<TempDir>> {
    let name = Path::new(shell)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    match name {
        "bash" => {
            let startup = tempfile::tempdir()?;
            let rc = startup.path().join("bashrc");
            std::fs::write(
                &rc,
                r#"
if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
_gg_prompt() { PS1='\W > '; PS2='> '; }
_gg_hooks=''
for _gg_hook in "${PROMPT_COMMAND[@]}"; do _gg_hooks+="$_gg_hook"$'\n'; done
unset PROMPT_COMMAND
PROMPT_COMMAND="${_gg_hooks}_gg_prompt"
unset _gg_hooks _gg_hook
_gg_prompt
"#,
            )?;
            command.arg("--rcfile");
            command.arg(rc);
            command.arg("-i");
            Ok(Some(startup))
        }
        "zsh" => {
            let startup = tempfile::tempdir()?;
            let original = command
                .get_env("ZDOTDIR")
                .or_else(|| command.get_env("HOME"))
                .unwrap_or_default()
                .to_owned();
            command.env("GG_SHELL_ZDOTDIR", original);
            command.env("GG_SHELL_BOOTSTRAP", startup.path());
            command.env("ZDOTDIR", startup.path());
            std::fs::write(
                startup.path().join(".zshenv"),
                r#"
ZDOTDIR=$GG_SHELL_ZDOTDIR
if [[ -r "$ZDOTDIR/.zshenv" ]]; then source "$ZDOTDIR/.zshenv"; fi
_gg_user_zdotdir=${ZDOTDIR:-$HOME}
ZDOTDIR=$GG_SHELL_BOOTSTRAP
"#,
            )?;
            std::fs::write(
                startup.path().join(".zshrc"),
                r#"
ZDOTDIR=$_gg_user_zdotdir
if [[ -r "$ZDOTDIR/.zshrc" ]]; then source "$ZDOTDIR/.zshrc"; fi
_gg_prompt() { PS1='%1/ > '; PS2='> '; RPS1=''; RPS2=''; }
precmd_functions+=(_gg_prompt)
_gg_prompt
unset GG_SHELL_ZDOTDIR GG_SHELL_BOOTSTRAP _gg_user_zdotdir
"#,
            )?;
            command.arg("-i");
            Ok(Some(startup))
        }
        "fish" => {
            command.arg("--interactive");
            command.arg("--init-command");
            command.arg(
                "function fish_prompt; printf '%s > ' (basename -- \"$PWD\"); end; function fish_right_prompt; end",
            );
            Ok(None)
        }
        _ => Ok(None),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::terminal::{Output, Terminal};
    use tokio::sync::mpsc;

    async fn read_until(output: &mut mpsc::Receiver<Output>, expected: &str) -> String {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            let mut text = String::new();
            while let Some(event) = output.recv().await {
                match event {
                    Output::Data { data } => text.push_str(&String::from_utf8_lossy(&data)),
                    event => panic!("shell ended before {expected:?}: {event:?}; output: {text}"),
                }
                if text.contains(expected) {
                    return text;
                }
            }
            panic!("output ended before {expected:?}");
        })
        .await
        .expect("prompt timed out")
    }

    async fn check_prompt(shell: &str, rc: &str, contents: &str) -> Result<()> {
        if std::process::Command::new(shell)
            .arg("--version")
            .output()
            .is_err()
        {
            return Ok(());
        }
        let home = tempfile::tempdir()?;
        std::fs::write(home.path().join(rc), contents)?;
        std::fs::create_dir(home.path().join("first"))?;
        std::fs::create_dir(home.path().join("first/second"))?;
        let mut command = CommandBuilder::new(shell);
        command.cwd(home.path().join("first"));
        command.env("HOME", home.path());
        command.env_remove("ZDOTDIR");
        command.env("TERM", "xterm-256color");
        let startup = configure(&mut command, OsStr::new(shell))?;
        let (mut terminal, mut output) = Terminal::spawn(command, 80, 24)?;
        terminal._startup = startup;
        let initial = read_until(&mut output, "first > ").await;
        assert!(!initial.contains("OLD_PROMPT"), "{initial}");
        assert!(!initial.contains("\\["), "{initial}");
        terminal.input(b"cd second\n")?;
        let changed = read_until(&mut output, "second > ").await;
        assert!(!changed.contains("OLD_PROMPT"), "{changed}");
        terminal.input(b"gg_marker\n")?;
        read_until(&mut output, "CONFIG_PRESERVED").await;
        terminal.input(b"exit\n")?;
        Ok(())
    }

    #[tokio::test]
    async fn bash_keeps_user_config_and_updates_the_minimal_prompt() -> Result<()> {
        check_prompt("bash", ".bashrc", "PS1=OLD_PROMPT\nPROMPT_COMMAND='PS1=OLD_PROMPT'\nalias gg_marker='echo CONFIG_PRESERVED'\n").await
    }

    #[tokio::test]
    async fn zsh_keeps_user_config_and_updates_the_minimal_prompt() -> Result<()> {
        check_prompt("zsh", ".zshrc", "PROMPT=OLD_PROMPT\nprecmd() { PROMPT=OLD_PROMPT; }\nalias gg_marker='echo CONFIG_PRESERVED'\n").await
    }
}
