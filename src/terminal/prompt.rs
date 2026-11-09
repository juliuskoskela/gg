use std::ffi::{OsStr, OsString};
use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::Result;
use portable_pty::CommandBuilder;
use tempfile::TempDir;

fn has_readline(shell: &OsStr) -> bool {
    Command::new(shell)
        .args([
            "--noprofile",
            "--norc",
            "-c",
            "builtin type bind >/dev/null 2>&1",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

pub(super) fn interactive_shell(shell: OsString) -> OsString {
    // nix develop can export a build-only Bash as SHELL, compiled without Readline.
    if Path::new(&shell).file_stem() != Some(OsStr::new("bash")) || has_readline(&shell) {
        return shell;
    }
    if let Some(path) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path) {
            let candidate = directory.join("bash");
            if candidate.is_file() && has_readline(candidate.as_os_str()) {
                return candidate.into_os_string();
            }
        }
    }
    let mut login = CommandBuilder::new_default_prog();
    login.env_remove("SHELL");
    login.get_shell().into()
}

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
shopt -s progcomp
bind '"\C-i": complete'
if ! declare -F _completion_loader >/dev/null && ! declare -F _comp_load >/dev/null; then
    IFS=: read -ra _gg_completion_dirs <<< "${XDG_DATA_DIRS:-}"
    for _gg_share in /usr/share "${_gg_completion_dirs[@]}"; do
        if [ -r "$_gg_share/bash-completion/bash_completion" ]; then
            . "$_gg_share/bash-completion/bash_completion"
            break
        fi
    done
    unset _gg_share _gg_completion_dirs
fi
_gg_prompt() { PS1='@ '; PS2='@ '; }
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
if (( ! $+functions[compdef] )); then
    autoload -Uz compinit
    compinit -i -D
fi
bindkey -M emacs '^I' expand-or-complete
bindkey -M viins '^I' expand-or-complete
_gg_prompt() { PS1='@ '; PS2='@ '; RPS1=''; RPS2=''; }
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
            command.arg("function fish_prompt; printf '@ '; end; function fish_right_prompt; end");
            Ok(None)
        }
        _ => Ok(None),
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::terminal::{Output, Terminal};
    use std::os::unix::fs::PermissionsExt;
    use tokio::sync::mpsc;

    async fn read_until(output: &mut mpsc::Receiver<Output>, expected: &str) -> String {
        let mut text = String::new();
        let result = tokio::time::timeout(std::time::Duration::from_secs(10), async {
            while let Some(event) = output.recv().await {
                match event {
                    Output::Data { data } => text.push_str(&String::from_utf8_lossy(&data)),
                    event => panic!("shell ended before {expected:?}: {event:?}; output: {text}"),
                }
                if text.contains(expected) {
                    return;
                }
            }
            panic!("output ended before {expected:?}");
        })
        .await;
        assert!(result.is_ok(), "waiting for {expected:?}; output: {text:?}");
        text
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
        std::fs::write(home.path().join("first/second/gg-completion-file"), "")?;
        let bin = home.path().join("bin");
        std::fs::create_dir(&bin)?;
        let executable = bin.join("gg-test-command");
        std::fs::write(&executable, "#!/bin/sh\necho COMMAND_COMPLETED\n")?;
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755))?;
        let shell = interactive_shell(shell.into());
        let mut command = CommandBuilder::new(&shell);
        command.cwd(home.path().join("first"));
        command.env("HOME", home.path());
        command.env_remove("ZDOTDIR");
        command.env("TERM", "xterm-256color");
        command.env(
            "PATH",
            format!(
                "{}:{}",
                bin.display(),
                std::env::var("PATH").unwrap_or_default()
            ),
        );
        let startup = configure(&mut command, &shell)?;
        let (mut terminal, mut output) = Terminal::spawn(command, 80, 24)?;
        terminal._startup = startup;
        let initial = read_until(&mut output, "@ ").await;
        assert!(!initial.contains("OLD_PROMPT"), "{initial}");
        assert!(!initial.contains("\\["), "{initial}");
        terminal.input(b"cd second\n")?;
        let changed = read_until(&mut output, "@ ").await;
        assert!(!changed.contains("OLD_PROMPT"), "{changed}");
        terminal.input(b"gg_marker\n")?;
        read_until(&mut output, "CONFIG_PRESERVED").await;
        terminal.input(b"printf 'FILE:%s\\n' gg-completion-f\t\n")?;
        read_until(&mut output, "FILE:gg-completion-file").await;
        terminal.input(b"\x1b[A\n")?;
        read_until(&mut output, "FILE:gg-completion-file").await;
        terminal.input(b"gg-test-c\t\n")?;
        read_until(&mut output, "COMMAND_COMPLETED").await;
        terminal.input(b"printf 'EDIT:%s\\n' ac\x1b[Db\n")?;
        read_until(&mut output, "EDIT:abc").await;
        terminal.input(b"exit\n")?;
        Ok(())
    }

    #[tokio::test]
    async fn bash_keeps_user_config_and_keeps_the_at_prompt_after_changing_directory() -> Result<()>
    {
        check_prompt("bash", ".bashrc", "PS1=OLD_PROMPT\nPROMPT_COMMAND='PS1=OLD_PROMPT'\nalias gg_marker='echo CONFIG_PRESERVED'\n").await
    }

    #[tokio::test]
    async fn zsh_keeps_user_config_and_keeps_the_at_prompt_after_changing_directory() -> Result<()>
    {
        check_prompt("zsh", ".zshrc", "PROMPT=OLD_PROMPT\nprecmd() { PROMPT=OLD_PROMPT; }\nalias gg_marker='echo CONFIG_PRESERVED'\n").await
    }
}
