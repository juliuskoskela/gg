use std::path::{self, Path, PathBuf};

use anyhow::{Context, Result};
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
#[cfg(target_os = "macos")]
use tauri::{
    AppHandle,
    menu::{MenuItem, PredefinedMenuItem},
};
use tauri::{
    Emitter, EventTarget, Manager, Window, Wry,
    menu::{Menu, MenuEvent, Submenu},
};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::{AppState, handler};
use gg_lib::messages::{RepoEvent, RevHeader};

// macOS requires an application menu and relies on Edit for native text editing.
#[cfg(target_os = "macos")]
pub fn build_main(
    app_handle: &AppHandle,
    open_windows: &[(String, String)],
) -> tauri::Result<Menu<Wry>> {
    let pkg = app_handle.package_info();
    let config = app_handle.config();
    let about = AboutMetadata {
        name: Some("GG".into()),
        version: Some(pkg.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        app_handle,
        pkg.name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app_handle, None, Some(about))?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::services(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::hide(app_handle, None)?,
            &PredefinedMenuItem::hide_others(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::quit(app_handle, None)?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app_handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app_handle, None)?,
            &PredefinedMenuItem::redo(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::cut(app_handle, None)?,
            &PredefinedMenuItem::copy(app_handle, None)?,
            &PredefinedMenuItem::paste(app_handle, None)?,
            &PredefinedMenuItem::select_all(app_handle, None)?,
        ],
    )?;
    let windows = Submenu::new(app_handle, "Window", true)?;
    windows.append(&PredefinedMenuItem::minimize(app_handle, None)?)?;
    if !open_windows.is_empty() {
        windows.append(&PredefinedMenuItem::separator(app_handle)?)?;
        for (label, name) in open_windows {
            windows.append(&MenuItem::with_id(
                app_handle,
                format!("window:{label}"),
                name,
                true,
                None::<&str>,
            )?)?;
        }
    }
    Menu::with_items(app_handle, &[&app_menu, &edit_menu, &windows])
}

#[cfg(target_os = "macos")]
pub fn rebuild_main(app_handle: &AppHandle, open_windows: &[(String, String)]) -> Result<()> {
    app_handle.set_menu(build_main(app_handle, open_windows)?)?;
    Ok(())
}

/// Computed enablement state for revision menu items
struct RevisionEnablement {
    new_child: bool,
    new_parent: bool,
    edit: bool,
    revert: bool,
    duplicate: bool,
    abandon: bool,
    squash: bool,
    restore: bool,
    bookmark: bool,
}

fn compute_revision_enablement(
    headers: &[RevHeader],
    ignore_immutable: bool,
) -> RevisionEnablement {
    let is_singleton = headers.len() == 1;
    let any_immutable = !ignore_immutable && headers.iter().any(|h| h.is_immutable);
    let oldest = headers.last();
    let oldest_has_single_parent = oldest.map(|h| h.parent_ids.len() == 1).unwrap_or(false);
    let newest = headers.first();

    RevisionEnablement {
        new_child: true,
        new_parent: !any_immutable && oldest_has_single_parent,
        edit: is_singleton && !any_immutable && !newest.map(|h| h.is_working_copy).unwrap_or(false),
        revert: true,
        duplicate: true,
        abandon: !any_immutable,
        squash: !any_immutable && oldest_has_single_parent,
        restore: is_singleton && !any_immutable && oldest_has_single_parent,
        bookmark: is_singleton,
    }
}

// enables global menu items based on currently selected revision(s)
pub fn handle_selection(
    menu: Menu<Wry>,
    headers: Option<&[RevHeader]>,
    ignore_immutable: bool,
) -> Result<()> {
    let Some(revision_submenu) = menu.get("revision") else {
        return Ok(());
    };
    let revision_submenu = revision_submenu.as_submenu_unchecked();

    match headers {
        None | Some([]) => {
            revision_submenu.enable("menu_revision_new_child", false)?;
            revision_submenu.enable("menu_revision_new_parent", false)?;
            revision_submenu.enable("menu_revision_edit", false)?;
            revision_submenu.enable("menu_revision_revert", false)?;
            revision_submenu.enable("menu_revision_duplicate", false)?;
            revision_submenu.enable("menu_revision_abandon", false)?;
            revision_submenu.enable("menu_revision_squash", false)?;
            revision_submenu.enable("menu_revision_restore", false)?;
            revision_submenu.enable("menu_revision_bookmark", false)?;
        }
        Some(headers) => {
            let state = compute_revision_enablement(headers, ignore_immutable);
            revision_submenu.enable("menu_revision_new_child", state.new_child)?;
            revision_submenu.enable("menu_revision_new_parent", state.new_parent)?;
            revision_submenu.enable("menu_revision_edit", state.edit)?;
            revision_submenu.enable("menu_revision_revert", state.revert)?;
            revision_submenu.enable("menu_revision_duplicate", state.duplicate)?;
            revision_submenu.enable("menu_revision_abandon", state.abandon)?;
            revision_submenu.enable("menu_revision_squash", state.squash)?;
            revision_submenu.enable("menu_revision_restore", state.restore)?;
            revision_submenu.enable("menu_revision_bookmark", state.bookmark)?;
        }
    }

    Ok(())
}

pub fn handle_event(window: &Window, event: MenuEvent) -> Result<()> {
    log::debug!("handling event {event:?}");
    let event_id = event.id.0.as_str();

    // we use a shared menu due to cleanup issues
    if !window.state::<AppState>().owns_menu_events(window)? {
        log::debug!("ignoring event for unfocused window {}", window.label());
        return Ok(());
    }

    if let Some(window_id) = event_id.strip_prefix("window:") {
        if let Some(w) = window.app_handle().get_webview_window(window_id) {
            #[cfg(target_os = "macos")]
            {
                crate::macos::remove_move_to_active_space(&w.as_ref().window());
                crate::macos::activate_app();
            }

            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }

    let target = EventTarget::window(window.label());
    match event_id {
        "menu_view_zoom_in" => window.emit_to(target, "gg://menu/view", "view.zoom-in")?,
        "menu_view_zoom_out" => window.emit_to(target, "gg://menu/view", "view.zoom-out")?,
        "menu_view_zoom_reset" => window.emit_to(target, "gg://menu/view", "view.zoom-reset")?,
        "menu_repo_init" => repo_init(window),
        "menu_repo_clone" => repo_clone(window),
        "menu_repo_open" => repo_open(window),
        "menu_repo_reopen" => repo_reopen(window)?,
        "menu_revision_new_child" => window.emit_to(target, "gg://menu/revision", "new_child")?,
        "menu_revision_new_parent" => window.emit_to(target, "gg://menu/revision", "new_parent")?,
        "menu_revision_edit" => window.emit_to(target, "gg://menu/revision", "edit")?,
        "menu_revision_revert" => window.emit_to(target, "gg://menu/revision", "revert")?,
        "menu_revision_duplicate" => window.emit_to(target, "gg://menu/revision", "duplicate")?,
        "menu_revision_abandon" => window.emit_to(target, "gg://menu/revision", "abandon")?,
        "menu_revision_squash" => window.emit_to(target, "gg://menu/revision", "squash")?,
        "menu_revision_restore" => window.emit_to(target, "gg://menu/revision", "restore")?,
        "menu_revision_bookmark" => window.emit_to(target, "gg://menu/revision", "bookmark")?,
        recent_id if recent_id.starts_with("recent:") => {
            let path = PathBuf::from(&recent_id["recent:".len()..]);
            let app_handle = window.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = super::try_create_window(&app_handle, Some(path)) {
                    log::error!("Failed to open recent workspace: {e:#}");
                }
            });
        }
        _ => (),
    };

    Ok(())
}

pub fn repo_open(window: &Window) {
    let window = window.clone();
    window.dialog().file().pick_folder(move |picked| {
        if let Some(FilePath::Path(wd)) = picked {
            handler::nonfatal!(super::reopen_repository(&window, wd));
        }
    });
}

pub fn repo_reopen(window: &Window) -> Result<()> {
    let config = super::try_open_repository(window, None).context("try_open_repository")?;
    window.emit_to(
        EventTarget::window(window.label()),
        "gg://repo/config",
        config,
    )?;
    Ok(())
}

pub fn repo_init(window: &Window) {
    let window = window.clone();
    window.dialog().file().pick_folder(move |picked| {
        if let Some(FilePath::Path(cwd)) = picked {
            let git_path = cwd.join(".git");

            let payload = RepoEvent::InitConfirm {
                path: cwd.to_string_lossy().to_string(),
                has_git: git_path.exists(),
            };

            handler::nonfatal!(window.emit_to(
                EventTarget::window(window.label()),
                "gg://menu/repo",
                payload
            ));
        }
    });
}

pub fn repo_clone(window: &Window) {
    let payload = RepoEvent::CloneURL;

    handler::nonfatal!(window.emit_to(
        EventTarget::window(window.label()),
        "gg://menu/repo",
        payload
    ));
}

pub fn repo_clone_with_url(window: &Window, url: String) {
    let window = window.clone();
    window.dialog().file().pick_folder(move |picked| {
        if let Some(FilePath::Path(parent_dir)) = picked {
            let repo_name = extract_repo_name(&url);
            let dest_path = parent_dir.join(&repo_name);
            let path = dest_path.to_string_lossy().to_string();

            let payload = RepoEvent::CloneConfirm { url, path };

            handler::nonfatal!(window.emit_to(
                EventTarget::window(window.label()),
                "gg://menu/repo",
                payload
            ));
        }
    });
}

// https://github.com/user/repo.git -> repo
// git@github.com:user/repo.git -> repo
// /path/to/repo -> repo
// /path/to/repo.git -> repo
fn extract_repo_name(url: &str) -> String {
    let url = url.trim_end_matches('/');
    let name = url
        .rsplit('/')
        .next()
        .or_else(|| url.rsplit(':').next())
        .unwrap_or("repo");

    name.strip_suffix(".git").unwrap_or(name).to_string()
}

pub fn abbreviate_path(path: &str) -> String {
    let path = Path::new(path);

    if let Ok(home) = etcetera::home_dir()
        && let Ok(relative) = path.strip_prefix(&home)
    {
        let sep = path::MAIN_SEPARATOR;
        return format!("~{sep}{}", relative.display());
    }

    path.display().to_string()
}

trait Enabler {
    fn enable(&self, id: &str, value: bool) -> tauri::Result<()>;
}

impl Enabler for Menu<Wry> {
    fn enable(&self, id: &str, value: bool) -> tauri::Result<()> {
        if let Some(item) = self.get(id).as_ref().and_then(|item| item.as_menuitem()) {
            item.set_enabled(value)
        } else {
            Ok(())
        }
    }
}

impl Enabler for Submenu<Wry> {
    fn enable(&self, id: &str, value: bool) -> tauri::Result<()> {
        if let Some(item) = self.get(id).as_ref().and_then(|item| item.as_menuitem()) {
            item.set_enabled(value)
        } else {
            Ok(())
        }
    }
}
