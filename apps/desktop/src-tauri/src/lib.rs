use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{ActivationPolicy, Emitter, Manager};
use tauri_nspanel::objc2_app_kit::{
    NSApplicationActivationOptions, NSRunningApplication, NSWorkspace,
};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

tauri_panel! {
    panel!(ScratchpadPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
}

const KEYCHAIN_SERVICE: &str = "com.velata.app";
const KEYCHAIN_ACCOUNT: &str = "api-key";

#[derive(Default)]
struct PreviousApp(Mutex<Option<i32>>);

fn remember_previous_app(app: &tauri::AppHandle) {
    let own_pid = std::process::id() as i32;
    let frontmost_pid = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|frontmost| frontmost.processIdentifier())
        .filter(|pid| *pid != own_pid);
    if let Some(pid) = frontmost_pid {
        *app.state::<PreviousApp>()
            .0
            .lock()
            .expect("previous app lock") = Some(pid);
    }
}

fn restore_previous_app(app: &tauri::AppHandle) {
    let pid = app
        .state::<PreviousApp>()
        .0
        .lock()
        .expect("previous app lock")
        .take();
    let Some(pid) = pid else {
        return;
    };
    if let Some(previous) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        let _ = previous.activateWithOptions(NSApplicationActivationOptions::empty());
    }
}

fn show_scratchpad(app: &tauri::AppHandle) {
    if let Ok(panel) = app.get_webview_panel("main") {
        remember_previous_app(app);
        panel.show_and_make_key();
    }
}

#[tauri::command]
fn hide_scratchpad(app: tauri::AppHandle) {
    if let Ok(panel) = app.get_webview_panel("main") {
        panel.hide();
    }
    restore_previous_app(&app);
}

fn api_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_api_key() -> Result<Option<String>, String> {
    match api_key_entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    api_key_entry()?
        .set_password(&key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_api_key() -> Result<(), String> {
    match api_key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn show_settings(app: &tauri::AppHandle) -> Result<(), String> {
    match app.get_webview_window("settings") {
        Some(window) => {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        None => {
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "settings",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Velata Settings")
            .inner_size(760.0, 560.0)
            .min_inner_size(560.0, 420.0)
            .resizable(true)
            .center()
            .build()
            .map_err(|error| error.to_string())?;
            let _ = window.set_focus();
        }
    }

    app.set_activation_policy(ActivationPolicy::Regular)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    show_settings(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .on_window_event(|window, event| {
            if window.label() == "settings" && matches!(event, tauri::WindowEvent::Destroyed) {
                let _ = window
                    .app_handle()
                    .set_activation_policy(ActivationPolicy::Accessory);
            }
        })
        .manage(PreviousApp::default())
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            delete_api_key,
            open_settings,
            hide_scratchpad
        ])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &toggle_shortcut && event.state == ShortcutState::Pressed {
                        if let Ok(panel) = app.get_webview_panel("main") {
                            if panel.is_visible() {
                                hide_scratchpad(app.clone());
                            } else {
                                remember_previous_app(app);
                                panel.show_and_make_key();
                                let _ = app.emit("summon", ());
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            app.set_activation_policy(ActivationPolicy::Accessory);

            let window = app
                .get_webview_window("main")
                .expect("main window should exist");
            let panel = window.to_panel::<ScratchpadPanel>()?;
            panel.set_level(PanelLevel::Floating.value());
            panel.set_style_mask(StyleMask::empty().nonactivating_panel().resizable().into());
            panel.set_collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .into(),
            );

            app.global_shortcut().register(toggle_shortcut)?;

            let open_item = MenuItem::with_id(
                app,
                "open-velata",
                "Open Velata",
                true,
                Some("CmdOrCtrl+Shift+Space"),
            )?;
            let new_draft_item = MenuItem::with_id(
                app,
                "new-draft",
                "New draft",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?;
            let settings_item =
                MenuItem::with_id(app, "open-settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let quit_item =
                MenuItem::with_id(app, "quit-velata", "Quit Velata", true, Some("CmdOrCtrl+Q"))?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &new_draft_item,
                    &PredefinedMenuItem::separator(app)?,
                    &settings_item,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item,
                ],
            )?;

            TrayIconBuilder::new()
                .icon(tauri::include_image!("icons/tray.png"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open-velata" => {
                        show_scratchpad(app);
                        let _ = app.emit("summon", ());
                    }
                    "new-draft" => {
                        show_scratchpad(app);
                        let _ = app.emit("new-draft", ());
                    }
                    "open-settings" => {
                        let _ = show_settings(app);
                    }
                    "quit-velata" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
