//! UniChat SDUI Schema
//!
//! Schema-driven UI definitions for all UniChat pages, keyboard shortcuts,
//! and modal dialogs.

use dioxus_shared::schema::builder::{PageBuilder, SchemaBuilder, ShortcutBuilder, ModalBuilder};
use dioxus_shared::schema::Schema;

pub fn build_unichat_schema() -> Schema {
    SchemaBuilder::new("unichat", "0.4.0")
        .page(dashboard_page)
        .page(connections_page)
        .page(overlay_management_page)
        .page(settings_page)
        .page(about_page)
        .page(analytics_page)
        .page(export_page)
        .page(keyboard_shortcuts_page)
        .shortcut(open_search_shortcut)
        .shortcut(open_pinned_shortcut)
        .shortcut(close_modals_shortcut)
        .shortcut(show_shortcuts_shortcut)
        .modal(confirm_delete_modal)
        .modal(user_profile_modal)
        .build()
}

fn dashboard_page(p: PageBuilder) -> PageBuilder {
    p.id("dashboard")
        .route("/dashboard")
        .title("Dashboard")
        .description("Main chat dashboard view")
        .layout("dashboard")
        .element(|e| e
            .id("dashboard-header")
            .component("dashboard-header")
            .row(1)
            .column(1)
            .col_span(12)
        )
        .element(|e| e
            .id("chat-container")
            .component("chat-container")
            .row(2)
            .column(1)
            .col_span(12)
            .child(|c| c
                .id("channel-list")
                .component("channel-list")
            )
            .child(|c| c
                .id("chat-messages")
                .component("chat-messages")
            )
            .child(|c| c
                .id("chat-composer")
                .component("chat-composer")
            )
        )
        .element(|e| e
            .id("sidebar")
            .component("sidebar")
            .column(13)
            .row(1)
            .row_span(2)
        )
        .element(|e| e
            .id("pinned-panel")
            .component("pinned-messages-panel")
            .visible(false)
        )
        .element(|e| e
            .id("search-overlay")
            .component("chat-search")
            .visible(false)
        )
        .element(|e| e
            .id("shortcuts-help")
            .component("keyboard-shortcuts-help")
            .visible(false)
        )
}

fn connections_page(p: PageBuilder) -> PageBuilder {
    p.id("connections")
        .route("/connections")
        .title("Connections")
        .description("Manage platform connections")
        .layout("single-column")
        .element(|e| e
            .id("connections-header")
            .component("page-header")
            .prop("title", "Platform Connections")
        )
        .element(|e| e
            .id("twitch-connection")
            .component("connection-card")
            .prop("platform", "twitch")
            .prop("icon", "twitch")
        )
        .element(|e| e
            .id("kick-connection")
            .component("connection-card")
            .prop("platform", "kick")
            .prop("icon", "kick")
        )
        .element(|e| e
            .id("youtube-connection")
            .component("connection-card")
            .prop("platform", "youtube")
            .prop("icon", "youtube")
        )
}

fn overlay_management_page(p: PageBuilder) -> PageBuilder {
    p.id("overlay-management")
        .route("/overlay-management")
        .title("Overlay Management")
        .description("Configure overlay settings")
        .layout("settings")
        .element(|e| e
            .id("overlay-header")
            .component("page-header")
            .prop("title", "Overlay Configuration")
        )
        .element(|e| e
            .id("overlay-settings")
            .component("settings-group")
            .prop("title", "Server Settings")
        )
        .element(|e| e
            .id("port-setting")
            .component("input")
            .prop("label", "Server Port")
            .prop("type", "number")
        )
        .element(|e| e
            .id("overlay-sources")
            .component("source-list")
        )
        .element(|e| e
            .id("start-overlay-btn")
            .component("button")
            .prop("label", "Start Overlay Server")
            .prop("variant", "primary")
        )
        .element(|e| e
            .id("stop-overlay-btn")
            .component("button")
            .prop("label", "Stop Overlay Server")
            .prop("variant", "danger")
        )
}

fn settings_page(p: PageBuilder) -> PageBuilder {
    p.id("settings")
        .route("/settings")
        .title("Settings")
        .description("Application settings")
        .layout("settings")
        .element(|e| e
            .id("settings-header")
            .component("page-header")
            .prop("title", "Settings")
        )
        .element(|e| e
            .id("appearance-settings")
            .component("settings-group")
            .prop("title", "Appearance")
        )
        .element(|e| e
            .id("theme-select")
            .component("select")
            .prop("label", "Theme")
            .prop("options", serde_json::json!(["light", "dark", "system"]))
        )
        .element(|e| e
            .id("density-select")
            .component("select")
            .prop("label", "Density")
            .prop("options", serde_json::json!(["comfortable", "compact"]))
        )
        .element(|e| e
            .id("feed-settings")
            .component("settings-group")
            .prop("title", "Feed")
        )
        .element(|e| e
            .id("feed-mode-select")
            .component("select")
            .prop("label", "Feed Mode")
            .prop("options", serde_json::json!(["mixed", "platform", "single"]))
        )
        .element(|e| e
            .id("auto-scroll-toggle")
            .component("toggle")
            .prop("label", "Auto-scroll to new messages")
        )
}

fn about_page(p: PageBuilder) -> PageBuilder {
    p.id("about")
        .route("/about")
        .title("About")
        .layout("centered")
        .element(|e| e
            .id("about-logo")
            .component("logo")
        )
        .element(|e| e
            .id("about-title")
            .component("heading")
            .prop("level", 1)
            .prop("text", "UniChat")
        )
        .element(|e| e
            .id("about-version")
            .component("text")
            .prop("text", "Version 0.4.0")
        )
        .element(|e| e
            .id("about-description")
            .component("text")
            .prop("text", "Unified chat application for Twitch, Kick, and YouTube")
        )
}

fn analytics_page(p: PageBuilder) -> PageBuilder {
    p.id("analytics")
        .route("/analytics")
        .title("Analytics")
        .description("Chat analytics and statistics")
        .layout("dashboard")
        .element(|e| e
            .id("analytics-header")
            .component("page-header")
            .prop("title", "Analytics")
        )
        .element(|e| e
            .id("message-count-stat")
            .component("stat-card")
            .prop("title", "Total Messages")
            .prop("value", 0)
        )
        .element(|e| e
            .id("active-users-stat")
            .component("stat-card")
            .prop("title", "Active Users")
            .prop("value", 0)
        )
}

fn export_page(p: PageBuilder) -> PageBuilder {
    p.id("export")
        .route("/export")
        .title("Export")
        .description("Export chat data")
        .layout("single-column")
        .element(|e| e
            .id("export-header")
            .component("page-header")
            .prop("title", "Export Chat Data")
        )
        .element(|e| e
            .id("export-format-select")
            .component("select")
            .prop("label", "Export Format")
            .prop("options", serde_json::json!(["json", "csv", "html"]))
        )
        .element(|e| e
            .id("export-date-range")
            .component("date-range-picker")
            .prop("label", "Date Range")
        )
        .element(|e| e
            .id("export-btn")
            .component("button")
            .prop("label", "Export")
            .prop("variant", "primary")
        )
}

fn keyboard_shortcuts_page(p: PageBuilder) -> PageBuilder {
    p.id("keyboard-shortcuts")
        .route("/keyboard-shortcuts")
        .title("Keyboard Shortcuts")
        .description("Available keyboard shortcuts")
        .layout("single-column")
        .element(|e| e
            .id("shortcuts-header")
            .component("page-header")
            .prop("title", "Keyboard Shortcuts")
        )
        .element(|e| e
            .id("shortcuts-list")
            .component("shortcuts-table")
        )
}

fn open_search_shortcut(s: ShortcutBuilder) -> ShortcutBuilder {
    s.id("open-search")
        .keys("ctrl+k")
        .action("open-search")
}

fn open_pinned_shortcut(s: ShortcutBuilder) -> ShortcutBuilder {
    s.id("open-pinned")
        .keys("ctrl+p")
        .action("open-pinned")
}

fn close_modals_shortcut(s: ShortcutBuilder) -> ShortcutBuilder {
    s.id("close-modals")
        .keys("escape")
        .action("close-modals")
}

fn show_shortcuts_shortcut(s: ShortcutBuilder) -> ShortcutBuilder {
    s.id("show-shortcuts")
        .keys("ctrl+?")
        .action("show-shortcuts")
}

fn confirm_delete_modal(m: ModalBuilder) -> ModalBuilder {
    m.id("confirm-delete")
        .title("Confirm Delete")
        .element(|e| e
            .id("delete-message")
            .component("text")
            .prop("text", "Are you sure you want to delete this item?")
        )
        .element(|e| e
            .id("delete-confirm-btn")
            .component("button")
            .prop("label", "Delete")
            .prop("variant", "danger")
        )
        .element(|e| e
            .id("delete-cancel-btn")
            .component("button")
            .prop("label", "Cancel")
        )
}

fn user_profile_modal(m: ModalBuilder) -> ModalBuilder {
    m.id("user-profile")
        .title("User Profile")
        .element(|e| e
            .id("profile-avatar")
            .component("avatar")
        )
        .element(|e| e
            .id("profile-username")
            .component("heading")
            .prop("level", 3)
        )
        .element(|e| e
            .id("profile-badges")
            .component("badge-list")
        )
}
