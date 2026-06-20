use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::platform_type_model::{PlatformKey, PlatformTypeModel};
use crate::services::auth::auth_state::OAuthStateService;
use crate::utils::http_client::shared_client;
use crate::utils::oauth_config_helper::get_oauth_provider_config;
use crate::{log_debug, log_info};
use chrono::{Duration, Utc};
use reqwest::Client;
use url::Url;
pub struct OAuthService {
  http: Client,
  oauth_state_service: OAuthStateService,
  oauth_loopback_service: crate::services::auth::oauth_loopback::OAuthLoopbackService,
}
impl Default for OAuthService {
  fn default() -> Self {
    Self::new()
  }
}
impl OAuthService {
  pub fn new() -> Self {
    Self {
      http: shared_client(),
      oauth_state_service: OAuthStateService::new(),
      oauth_loopback_service: super::oauth_loopback::OAuthLoopbackService::new(),
    }
  }
  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    let config = get_oauth_provider_config(
      &platform,
      &crate::utils::config_helper::SharedConfig::default(),
    )?;
    let (host, port, path) =
      crate::services::auth::auth_internal::parse_loopback_redirect(&config.redirect_uri)?;
    self
      .oauth_loopback_service
      .start_listener(platform.as_key(), &host, port, &path)?;
    let session = self.oauth_state_service.create_session(&platform)?;
    let code_challenge =
      crate::services::auth::auth_internal::pkce_challenge(&session.code_verifier);
    let scope = config.scopes.join(" ");
    let mut url =
      Url::parse(&config.authorize_url).map_err(|e| format!("invalid authorize url: {e}"))?;
    url
      .query_pairs_mut()
      .append_pair("client_id", &config.client_id)
      .append_pair("redirect_uri", &config.redirect_uri)
      .append_pair("response_type", "code")
      .append_pair("scope", &scope)
      .append_pair("state", &session.state)
      .append_pair("code_challenge", &code_challenge)
      .append_pair("code_challenge_method", "S256");
    Ok(url.to_string())
  }
  pub fn wait_for_callback(&self, platform: PlatformTypeModel) -> Result<String, String> {
    self.oauth_loopback_service.wait_for_callback(
      platform.as_key(),
      crate::constants::OAUTH_CALLBACK_TIMEOUT_SECS,
    )
  }
  pub async fn complete_auth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
    config: &crate::utils::config_helper::SharedConfig,
  ) -> Result<AuthAccountModel, String> {
    let callback = Url::parse(&callback_url).map_err(|e| format!("invalid callback url: {e}"))?;
    let params = crate::services::auth::auth_internal::extract_callback_params(&callback);
    if let Some(error_code) = params.get("error") {
      let description = params
        .get("error_description")
        .cloned()
        .unwrap_or_else(|| "authorization failed at provider".to_string());
      log_info!(
        "OAuth authorization denied for {:?}: {} - {}",
        platform,
        error_code,
        description
      );
      return Err(format!("{error_code}: {description}"));
    }
    let code = params
      .get("code")
      .ok_or_else(|| "missing code parameter in callback".to_string())?;
    let state_param = params
      .get("state")
      .ok_or_else(|| "missing state parameter in callback".to_string())?;
    let session = self.oauth_state_service.consume_session(state_param)?;
    let config = get_oauth_provider_config(&platform, config)?;
    let token = crate::services::auth::auth_internal::exchange_code_for_token(
      &self.http,
      &platform,
      code,
      &session.code_verifier,
      &config,
    )
    .await?;
    let (username, user_id, avatar_url) =
      crate::services::auth::auth_internal::fetch_identity(&self.http, &platform, &token, &config)
        .await?;
    let expires_at = token
      .expires_in_seconds
      .map(|seconds| (Utc::now() + Duration::seconds(seconds)).to_rfc3339());
    let account = AuthAccountModel {
      id: format!("acc-{}-{}", platform.as_key(), user_id),
      platform: platform.clone(),
      username,
      user_id,
      avatar_url,
      access_token: Some(token.access_token.clone()),
      refresh_token: token.refresh_token.clone(),
      auth_status: AuthStatusModel::Authorized,
      token_expires_at: expires_at,
      authorized_at: Utc::now().to_rfc3339(),
    };
    log_info!(
      "OAuth completed successfully for {:?}, user: {}",
      platform,
      account.username
    );
    Ok(account)
  }
}
