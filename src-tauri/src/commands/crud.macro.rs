#[macro_export]
macro_rules! define_crud_routes {
  (
        prefix: $prefix:ident,
        accessor: $accessor:expr,
        table: $table:expr,
        methods: {
            get: $method_get:ident,
            get_all: $method_get_all:ident,
            create: $method_create:ident,
            update: $method_update:ident,
            patch: $method_patch:ident,
            delete: $method_delete:ident
        }
    ) => {
    paste::paste! {
        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _get>](
            id: String,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_get($table, &id)
                .await
                .map_err(|e| e.to_string())?;
            match result {
                Some(data) => Ok(crate::utils::response::Response::success("Found", data)),
                None => Ok(crate::utils::response::Response::not_found(stringify!($prefix))),
            }
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _get_all>](
            filter: Option<serde_json::Value>,
            skip: Option<u64>,
            limit: Option<u64>,
            sort_by: Option<String>,
            sort_asc: Option<bool>,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<Vec<serde_json::Value>>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_get_all($table, filter, skip, limit, sort_by, sort_asc.unwrap_or(true))
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::success("Found", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _create>](
            data: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_create($table, data)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::created("Created", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _update>](
            id: String,
            data: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_update($table, &id, data)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::updated("Updated", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _patch>](
            id: String,
            patch: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_patch($table, &id, patch)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::updated("Patched", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _delete>](
            id: String,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_delete($table, &id)
                .await
                .map_err(|e| e.to_string())?;
            if result {
                Ok(crate::utils::response::Response::deleted("Deleted", serde_json::Value::Null))
            } else {
                Ok(crate::utils::response::Response::error(
                    crate::utils::response::Status::Error,
                    "Delete failed",
                ))
            }
        }
    }
  };
}

#[macro_export]
macro_rules! define_crud_routes_no_table {
  (
        prefix: $prefix:ident,
        accessor: $accessor:expr,
        methods: {
            get: $method_get:ident,
            get_all: $method_get_all:ident,
            create: $method_create:ident,
            update: $method_update:ident,
            patch: $method_patch:ident,
            delete: $method_delete:ident
        }
    ) => {
    paste::paste! {
        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _get>](
            id: String,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_get(&id)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::success("Found", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _get_all>](
            filter: Option<serde_json::Value>,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<Vec<serde_json::Value>>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_get_all(filter)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::success("Found", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _create>](
            data: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_create(data)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::created("Created", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _update>](
            id: String,
            data: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_update(&id, data)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::updated("Updated", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _patch>](
            id: String,
            patch: serde_json::Value,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_patch(&id, patch)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::updated("Patched", result))
        }

        #[allow(dead_code)]
        #[tauri::command(rename_all = "snake_case")]
        pub async fn [<$prefix _delete>](
            id: String,
            state: tauri::State<'_, Arc<AppState>>,
        ) -> Result<crate::utils::response::Response<serde_json::Value>, String> {
            let service = ($accessor)(&state);
            let result = service
                .$method_delete(&id)
                .await
                .map_err(|e| e.to_string())?;
            Ok(crate::utils::response::Response::deleted("Deleted", result))
        }
    }
  };
}
