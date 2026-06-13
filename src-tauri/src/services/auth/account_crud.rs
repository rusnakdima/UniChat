//! Account CRUD Operations
//! Handles account listing, upsert, and removal

use crate::models::auth_account_model::AuthAccountModel;
use crate::models::platform_type_model::PlatformTypeModel;

use super::AccountService;

impl AccountService {
  pub fn list_accounts(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.token_vault_service.read_accounts(&platform)
  }

  pub fn upsert_account(&self, account: &AuthAccountModel) -> Result<(), String> {
    self.token_vault_service.upsert_account(account)
  }

  pub fn remove_account(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<(), String> {
    self
      .token_vault_service
      .remove_account(platform, account_id)
  }

  pub fn get_auth_status(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.token_vault_service.read_accounts(&platform)
  }
}
