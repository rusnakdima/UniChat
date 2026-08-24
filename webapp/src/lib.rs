//! UniChat Desktop Application

#![allow(non_snake_case)]

mod domain;
mod application;
mod infrastructure;
mod presentation;

use dioxus::prelude::*;

#[allow(unused_imports)]
use crate::application::state::*;
#[allow(unused_imports)]
use crate::domain::entities::*;
#[allow(unused_imports)]
use crate::domain::repositories::*;

#[allow(dead_code)]
fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();
    
    log::info!("Starting UniChat Desktop v0.4.0");
    
    dioxus::LaunchBuilder::desktop()
        .launch(App);
}

// ============================================================================
// Router Definition
// ============================================================================

#[derive(Clone, Routable)]
#[allow(dead_code)]
enum Route {
    #[route("/")]
    Dashboard,
    #[route("/connections")]
    Connections,
    #[route("/settings")]
    Settings,
    #[route("/overlay-management")]
    OverlayManagement,
    #[route("/about")]
    About,
}

// ============================================================================
// Root Application Component
// ============================================================================

#[component]
fn App() -> Element {
    // Provide application-wide state
    let _app_state = use_app_state();
    
    rsx! {
        div {
            class: "min-h-screen bg-gray-900 text-white",
            Router::<Route> {}
        }
    }
}

// ============================================================================
// Dashboard Page
// ============================================================================

#[component]
fn Dashboard() -> Element {
    let _channels = use_channels();
    let _prefs = use_dashboard_preferences();
    
    rsx! {
        div {
            class: "p-6",
            div {
                class: "text-2xl font-bold mb-4",
                "Dashboard"
            }
            div {
                class: "grid grid-cols-12 gap-4",
                ChatContainer {}
            }
        }
    }
}

// ============================================================================
// Chat Container Component
// ============================================================================

#[component]
fn ChatContainer() -> Element {
    let channels = use_channels();
    
    rsx! {
        div {
            class: "col-span-12 bg-gray-800 rounded-lg p-4",
            div { class: "text-lg font-semibold mb-2", "Chat" }
            div { class: "text-gray-400", "Connected channels will appear here" }
            div {
                class: "mt-4 space-y-2",
                for channel in channels.channels.iter() {
                    ChatMessage { channel_name: "{channel.channel_name}", platform: channel.platform.clone() }
                }
            }
        }
    }
}

// ============================================================================
// Individual Chat Message Component
// ============================================================================

#[derive(Props, PartialEq, Clone)]
struct ChatMessageProps {
    channel_name: String,
    platform: String,
}

#[component]
fn ChatMessage(props: ChatMessageProps) -> Element {
    rsx! {
        div {
            class: "bg-gray-700 rounded p-3 mb-2",
            div { class: "font-semibold text-sm", "{props.platform}: {props.channel_name}" }
            div { class: "text-gray-400 text-xs", "Click to connect" }
        }
    }
}

// ============================================================================
// Connection Card Component
// ============================================================================

#[derive(Props, PartialEq, Clone)]
struct ConnectionCardProps {
    platform: String,
}

#[component]
fn ConnectionCard(props: ConnectionCardProps) -> Element {
    let platform = props.platform.clone();
    let initial = platform.chars().next().unwrap_or('T').to_ascii_uppercase().to_string();
    
    rsx! {
        div {
            class: "bg-gray-800 rounded-lg p-4 flex items-center justify-between",
            div {
                class: "flex items-center gap-4",
                div {
                    class: "w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center",
                    span { class: "text-xl", "{initial}" }
                }
                div {
                    div { class: "font-semibold", "{platform}" }
                    div { class: "text-sm text-gray-400", "Not connected" }
                }
            }
            button {
                class: "px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition cursor-pointer",
                onclick: move |_| {
                    log::info!("Connect to {}", platform);
                },
                "Connect"
            }
        }
    }
}

// ============================================================================
// Connections Page
// ============================================================================

#[component]
fn Connections() -> Element {
    let platforms = vec!["twitch".to_string(), "kick".to_string(), "youtube".to_string()];
    
    rsx! {
        div {
            class: "p-6",
            div {
                class: "text-2xl font-bold mb-6",
                "Platform Connections"
            }
            div {
                class: "space-y-4",
                for platform in platforms {
                    ConnectionCard { platform: platform }
                }
            }
        }
    }
}

// ============================================================================
// Settings Page
// ============================================================================

#[component]
fn Settings() -> Element {
    let prefs = use_dashboard_preferences();
    
    rsx! {
        div {
            class: "p-6 max-w-2xl",
            div {
                class: "text-2xl font-bold mb-6",
                "Settings"
            }
            div {
                class: "space-y-6",
                div {
                    class: "bg-gray-800 rounded-lg p-4",
                    div { class: "font-semibold mb-3 text-lg", "Appearance" }
                    div { class: "space-y-3",
                        div { class: "flex justify-between items-center",
                            span { class: "text-gray-300", "Theme" }
                            span { class: "text-gray-400", "dark" }
                        }
                        div { class: "flex justify-between items-center",
                            span { class: "text-gray-300", "Density" }
                            span { class: "text-gray-400", "{prefs.density_mode}" }
                        }
                    }
                }
                div {
                    class: "bg-gray-800 rounded-lg p-4",
                    div { class: "font-semibold mb-3 text-lg", "Feed" }
                    div { class: "space-y-3",
                        div { class: "flex justify-between items-center",
                            span { class: "text-gray-300", "Feed Mode" }
                            span { class: "text-gray-400", "{prefs.feed_mode}" }
                        }
                        div { class: "flex justify-between items-center",
                            span { class: "text-gray-300", "Auto-scroll" }
                            span { class: "text-gray-400", if prefs.auto_scroll { "enabled" } else { "disabled" } }
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// Overlay Management Page
// ============================================================================

#[derive(PartialEq, Clone)]
#[allow(dead_code)]
struct OverlayState {
    port: u16,
    enabled: bool,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            port: 8080,
            enabled: false,
        }
    }
}

#[component]
fn OverlayManagement() -> Element {
    let mut overlay_config = use_signal(OverlayState::default);
    
    rsx! {
        div {
            class: "p-6 max-w-2xl",
            div {
                class: "text-2xl font-bold mb-6",
                "Overlay Configuration"
            }
            div {
                class: "bg-gray-800 rounded-lg p-4 mb-4",
                div { class: "font-semibold mb-3", "Server Settings" }
                div {
                    class: "flex items-center gap-4 mb-4",
                    label { class: "text-gray-300", "Port:" }
                    input {
                        class: "bg-gray-700 rounded px-3 py-2 w-24 text-white",
                        r#type: "number",
                        value: "{overlay_config.read().port}",
                        oninput: move |evt| {
                            if let Ok(port) = evt.value().parse::<u16>() {
                                overlay_config.write().port = port;
                            }
                        }
                    }
                }
            }
            div {
                class: "flex gap-4",
                button {
                    class: "px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition cursor-pointer",
                    onclick: move |_| {
                        log::info!("Starting overlay server on port {}", overlay_config.read().port);
                        overlay_config.write().enabled = true;
                    },
                    "Start Server"
                }
                button {
                    class: "px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition cursor-pointer",
                    onclick: move |_| {
                        log::info!("Stopping overlay server");
                        overlay_config.write().enabled = false;
                    },
                    "Stop Server"
                }
            }
        }
    }
}

// ============================================================================
// About Page
// ============================================================================

#[component]
fn About() -> Element {
    rsx! {
        div {
            class: "p-6 flex flex-col items-center justify-center min-h-[80vh]",
            div {
                class: "text-5xl font-bold mb-4",
                "UniChat"
            }
            div {
                class: "text-xl text-gray-400 mb-2",
                "Version 0.4.0"
            }
            div {
                class: "text-gray-400",
                "Unified chat application for Twitch, Kick, and YouTube"
            }
        }
    }
}
