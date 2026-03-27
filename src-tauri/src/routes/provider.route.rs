use crate::models::provider_contract_model::{
  ConnectionModeModel, MessageReferenceModel, PlatformTypeModel, ProviderCapabilitiesModel,
  ProviderCommandResultModel,
};
use crate::services::provider_capability_service::getProviderCapabilities;

fn disconnectedCapabilities() -> ProviderCapabilitiesModel {
  ProviderCapabilitiesModel {
    can_listen: false,
    can_reply: false,
    can_delete: false,
  }
}

#[tauri::command]
pub fn connectPlatform(
  platform: PlatformTypeModel,
  connection_mode: ConnectionModeModel,
  credentials_or_channel: Option<String>,
) -> ProviderCommandResultModel {
  let capabilities = getProviderCapabilities(&platform, &connection_mode);

  ProviderCommandResultModel {
    platform,
    connection_mode: Some(connection_mode),
    summary: format!(
      "Prepared provider session for {}.",
      credentials_or_channel.unwrap_or_else(|| "default target".to_string())
    ),
    capabilities,
  }
}

#[tauri::command]
pub fn disconnectPlatform(platform: PlatformTypeModel) -> ProviderCommandResultModel {
  ProviderCommandResultModel {
    platform,
    connection_mode: None,
    summary: "Provider session marked as disconnected.".to_string(),
    capabilities: disconnectedCapabilities(),
  }
}

#[tauri::command]
pub fn listenPlatformMessages(
  platform: PlatformTypeModel,
  connection_mode: ConnectionModeModel,
) -> ProviderCommandResultModel {
  let capabilities = getProviderCapabilities(&platform, &connection_mode);

  ProviderCommandResultModel {
    platform,
    connection_mode: Some(connection_mode),
    summary: "Listening contract prepared for normalized message routing.".to_string(),
    capabilities,
  }
}

#[tauri::command]
pub fn replyToMessage(
  platform: PlatformTypeModel,
  connection_mode: ConnectionModeModel,
  message_ref: MessageReferenceModel,
  text: String,
) -> ProviderCommandResultModel {
  let capabilities = getProviderCapabilities(&platform, &connection_mode);
  let summary = format!(
    "Reply contract prepared for message {} with {} characters.",
    message_ref.source_message_id,
    text.chars().count()
  );

  ProviderCommandResultModel {
    platform,
    connection_mode: Some(connection_mode),
    summary,
    capabilities,
  }
}

#[tauri::command]
pub fn deleteMessage(
  platform: PlatformTypeModel,
  connection_mode: ConnectionModeModel,
  message_ref: MessageReferenceModel,
) -> ProviderCommandResultModel {
  let capabilities = getProviderCapabilities(&platform, &connection_mode);
  let summary = format!(
    "Delete contract prepared for message {}.",
    message_ref.source_message_id
  );

  ProviderCommandResultModel {
    platform,
    connection_mode: Some(connection_mode),
    summary,
    capabilities,
  }
}

#[tauri::command]
pub fn providerCapabilityLookup(
  platform: PlatformTypeModel,
  connection_mode: ConnectionModeModel,
) -> ProviderCommandResultModel {
  let capabilities = getProviderCapabilities(&platform, &connection_mode);

  ProviderCommandResultModel {
    platform,
    connection_mode: Some(connection_mode),
    summary: "Capability lookup resolved for provider session.".to_string(),
    capabilities,
  }
}
