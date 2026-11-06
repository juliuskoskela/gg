use tauri::Window;
use tauri_plugin_dialog::{DialogExt, FilePath};

// the destination is always chosen by the user, never supplied by imported JSON.
#[tauri::command(async)]
pub(super) async fn export_review(
    window: Window,
    json: String,
    filename: String,
) -> Result<bool, String> {
    if json.len() > 10 * 1024 * 1024 {
        return Err("Review exceeds the 10 MB limit".to_owned());
    }
    let document: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    if document["format"] != "gg.review" || document["version"] != 1 {
        return Err("Unsupported review format".to_owned());
    }
    let name: String = filename
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
        .take(100)
        .collect();
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .dialog()
        .file()
        .add_filter("GG+ review", &["json"])
        .set_file_name(if name.is_empty() {
            "review.gg-review.json"
        } else {
            &name
        })
        .save_file(move |destination| {
            let _ = tx.send(destination);
        });
    match rx.await.map_err(|e| e.to_string())? {
        None => Ok(false),
        Some(FilePath::Path(path)) => {
            tokio::fs::write(path, json)
                .await
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        Some(_) => Err("Choose a local file for the review export".to_owned()),
    }
}
