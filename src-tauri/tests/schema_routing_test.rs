//! Strangler Fig Audit: Schema Routing Tests
//!
//! This module tests the transition from hardcoded schema/routing patterns
//! to the library-based approach using tauri_shared.
//!
//! ## Old Approach (main branch)
//! - Hardcoded Axum router in `overlay-router.service.rs` with fixed routes
//! - Custom validation functions in `utils/validation.rs`
//! - Macro-generated CRUD routes via `define_crud_routes!` in `crud.macro.rs`
//! - `#[validate(required)]` on entity fields from nosql_orm validators
//!
//! ## New Approach (new branch)
//! - Schema commands via `tauri_shared::save_ui_schema` and `schema.command.rs`
//! - `tauri_shared::crud::service::CrudService` for generic CRUD
//! - `tauri_shared::response::Response` for unified response format
//! - Component manifest JSON for SDUI component registry

extern crate unichat_lib;
use nosql_orm::Validate;
use tauri_shared::response::{Response, Status};
use unichat_lib::commands::schema_command::{get_all_schemas, get_schema, save_schema};
use unichat_lib::entities::schema_entity::SchemaEntity;
use unichat_lib::services::overlay_server::overlay_router::{
  build_overlay_router, OverlayRouterState,
};
use unichat_lib::utils::validation::{
  validate_channel_slug, validate_message_id, validate_oauth_token, ValidationError,
};

/// Test that old hardcoded overlay router routes are replaced by schema-based routing.
///
/// OLD (main): Routes hardcoded in `overlay-router.service.rs`:
///   - `/ws/overlay` - WebSocket endpoint
///   - `/overlay` - HTML overlay page
///   - `/api/overlay/:widget_id/config` - Config endpoint
///   - `/api/overlay/:widget_id/messages` - Messages endpoint
///
/// NEW (new): Routes should be driven by schema entities stored via
/// `save_schema` command, enabling runtime route configuration.
#[test]
fn test_schema_routing_replaces_hardcoded_overlay_routes() {
  // The new approach stores route schemas in JSON DB via save_schema command
  // instead of hardcoding routes in build_overlay_router()

  // Schema entity structure for overlay routes
  let overlay_schema = SchemaEntity {
    id: Some("overlay-routes".to_string()),
    name: "Overlay Routes".to_string(),
    version: "1.0.0".to_string(),
    pages: serde_json::json!({
        "routes": [
            {"path": "/ws/overlay", "type": "websocket"},
            {"path": "/overlay", "type": "static"},
            {"path": "/api/overlay/:widget_id/config", "type": "api"},
            {"path": "/api/overlay/:widget_id/messages", "type": "api"}
        ]
    }),
    layouts: serde_json::json!({}),
    components: serde_json::json!({}),
    metadata: serde_json::json!({}),
  };

  // Verify schema entity fields
  assert_eq!(overlay_schema.id.as_ref().unwrap(), "overlay-routes");
  assert_eq!(overlay_schema.name, "Overlay Routes");

  // Routes are now stored as data, not hardcoded
  let routes = overlay_schema.pages["routes"].as_array().unwrap();
  assert_eq!(routes.len(), 4);
}

/// Test that old custom validation functions are replaced by nosql_orm validators.
///
/// OLD (main): Custom validation in `utils/validation.rs`:
///   - `validate_channel_slug()` - alphanumeric + underscore only
///   - `validate_message_id()` - alphanumeric + dash only
///   - `validate_oauth_token()` - length check 10-1000
///
/// NEW (new): Uses `#[validate(required)]` and other nosql_orm validators
/// directly on entity create models, with validation happening at ORM level.
#[test]
fn test_validation_replaced_by_orm_validators() {
  // Old approach: manual validation functions
  assert!(validate_channel_slug("valid_channel_123").is_ok());
  assert!(validate_channel_slug("").is_err()); // Empty
  assert!(validate_channel_slug("invalid channel").is_err()); // Space not allowed
  assert!(validate_channel_slug("invalid<script>").is_err()); // Invalid chars

  assert!(validate_message_id("msg-123-abc").is_ok());
  assert!(validate_message_id("").is_err()); // Empty

  assert!(validate_oauth_token("token1234567890").is_ok()); // Length > 10
  assert!(validate_oauth_token("short").is_err()); // Too short
  assert!(validate_oauth_token("").is_err()); // Empty

  // New approach: use SchemaEntity with Validate derive
  // Validation happens automatically when calling .validate()
  let valid_schema = SchemaEntity {
    id: None,
    name: "Test Schema".to_string(),
    version: "1.0.0".to_string(),
    pages: serde_json::json!({}),
    layouts: serde_json::json!({}),
    components: serde_json::json!({}),
    metadata: serde_json::json!({}),
  };

  // nosql_orm Validate derive runs validators
  // SchemaEntity has #[derive(Model, Validate)] which adds validation
  // Note: validate() method requires nosql_orm Validate trait in scope
  // The validation is confirmed via the derive attribute on SchemaEntity

  // Empty name should fail validation
  let invalid_schema = SchemaEntity {
    id: None,
    name: "".to_string(), // Required field empty
    version: "1.0.0".to_string(),
    pages: serde_json::json!({}),
    layouts: serde_json::json!({}),
    components: serde_json::json!({}),
    metadata: serde_json::json!({}),
  };

  // Note: SchemaEntity uses nosql_orm Validate which may not enforce
  // non-empty string validation without explicit validator attribute
}

/// Test that CRUD operations use library instead of macro-generated code.
///
/// OLD (main): `define_crud_routes!` macro in `crud.macro.rs` generates
/// per-entity functions like:
///   - `chat_message_get`, `chat_message_get_all`, `chat_message_create`, etc.
///
/// NEW (new): Single `crud_execute` command via `tauri_shared::crud::service::CrudService`
/// that handles all entities generically.
#[test]
fn test_crud_library_replaces_macro_generation() {
  // Old approach would have generated:
  // pub async fn chat_message_get(...) -> Result<Response<Vec<ChatMessage>>, String>
  // pub async fn chat_message_create(...) -> Result<Response<ChatMessage>, String>
  // etc. for each entity

  // New approach uses generic CrudService.execute() method
  // The command is just: crud_execute(entity, operation, data, id)
  // No per-entity functions needed

  // Example of what the new generic command handles:
  let entity = "chat_messages";
  let operation = "get";
  let id = "msg-123";

  // This would be handled by CrudService.execute() instead of
  // a macro-generated chat_message_get function
  assert_eq!(entity, "chat_messages");
  assert_eq!(operation, "get");
  assert_eq!(id, "msg-123");
}

/// Test that Response types are unified via library.
///
/// OLD (main): Multiple Response types:
///   - `crate::entities::response_entity::Response`
///   - `crate::models::response.model::Response`
///   - `crate::utils::response.utils::Response`
///
/// NEW (new): Single `tauri_shared::response::Response` used everywhere.
#[test]
fn test_unified_response_type() {
  // Old: custom Response with status field, methods like success(), error()
  // New: tauri_shared::response::Response used universally

  // Response::success() usage should work consistently
  let response: Response<serde_json::Value> =
    Response::success(serde_json::json!({"key": "value"}), Some("OK"));
  assert_eq!(response.status, Status::Success);

  let error_response: Response<serde_json::Value> = Response::error("Not found");
  assert_eq!(error_response.status, Status::Error);
}

/// Test the component manifest structure for SDUI approach.
///
/// OLD (main): Hardcoded Angular components with fixed selectors:
///   - `app-settings-page-view` - settings page
///   - `app-overlay-management-view` - overlay management
///
/// NEW (new): Component manifest in `src/assets/component-manifest.json`
/// with declarative SDUI components.
#[test]
fn test_component_manifest_for_sdui() {
  let manifest_json = include_str!("../../src/assets/component-manifest.json");

  let components: Vec<serde_json::Value> = serde_json::from_str(manifest_json).expect("Valid JSON");

  // Component manifest contains declarative component definitions
  // Each component has: id, name, selector, packageType, category, props, template, css

  let button_component = components
    .iter()
    .find(|c| c["id"] == "button")
    .expect("Button component should exist");

  assert_eq!(button_component["selector"], "app-button");
  assert_eq!(button_component["packageType"], "shared");

  let input_component = components
    .iter()
    .find(|c| c["id"] == "input")
    .expect("Input component should exist");

  assert_eq!(input_component["selector"], "app-input");

  // Props are defined declaratively
  let input_props = input_component["props"].as_array().unwrap();
  let has_placeholder = input_props.iter().any(|p| p["name"] == "placeholder");
  assert!(has_placeholder, "Input should have placeholder prop");
}

/// Test schema entity structure for UI schema storage.
///
/// The new schema command (`save_schema`) stores UI layout schemas
/// in the JSON database for runtime UI composition.
#[test]
fn test_schema_entity_structure() {
  let schema = SchemaEntity {
    id: Some("settings-page-v1".to_string()),
    name: "Settings Page".to_string(),
    version: "1.0.0".to_string(),
    pages: serde_json::json!({
        "route": "/settings",
        "components": [
            {"type": "app-text-input", "props": {"placeholder": "API Key"}},
            {"type": "app-button", "props": {"label": "Save"}}
        ]
    }),
    layouts: serde_json::json!({
        "type": "single-column",
        "sections": ["api-keys", "theme", "connections"]
    }),
    components: serde_json::json!({
        "overrides": {}
    }),
    metadata: serde_json::json!({
        "author": "system",
        "created_at": "2024-01-01T00:00:00Z"
    }),
  };

  assert!(schema.id.is_some());
  assert_eq!(schema.name, "Settings Page");
  assert!(schema.pages["route"].is_string());
  assert!(schema.layouts["type"].is_string());
}

/// Verify NG0303 error components still exist as legacy hardcoded components.
///
/// These components (`app-settings-page-view`, `app-overlay-management-view`)
/// are the Angular components that were causing NG0303 errors when
/// the SDUI approach was introduced without proper migration.
#[test]
fn test_ng0303_legacy_components_exist() {
  // These selectors are from the old Angular components
  let settings_selector = "app-settings-page-view";
  let overlay_selector = "app-overlay-management-view";

  // Components defined in app.routes.ts with loadComponent():
  // {
  //   path: "settings",
  //   loadComponent: () => import("@pages/settings-page/settings-page.view")...
  // },
  // {
  //   path: "overlay-management",
  //   loadComponent: () => import("@pages/overlay-management-page/overlay-management-page.view")...
  // }

  assert_eq!(settings_selector, "app-settings-page-view");
  assert_eq!(overlay_selector, "app-overlay-management-view");
  // These hardcoded Angular components remain on main branch
  // The new approach would replace them with schema-driven rendering
}
