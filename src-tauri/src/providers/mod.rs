/* providers - nosql_orm providers with pooling support */

pub mod json_provider {
  pub use nosql_orm::providers::JsonProvider;
}

#[path = "data.provider.rs"]
pub mod data_provider;
