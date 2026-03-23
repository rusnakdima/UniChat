use crate::models::provider_contract_model::{
  ConnectionModeModel, PlatformTypeModel, ProviderCapabilitiesModel,
};

pub fn getProviderCapabilities(
  platform: &PlatformTypeModel,
  connection_mode: &ConnectionModeModel,
) -> ProviderCapabilitiesModel {
  match connection_mode {
    ConnectionModeModel::ChannelWatch => ProviderCapabilitiesModel {
      can_listen: true,
      can_reply: false,
      can_delete: false,
    },
    ConnectionModeModel::Account => match platform {
      PlatformTypeModel::Youtube => ProviderCapabilitiesModel {
        can_listen: true,
        can_reply: true,
        can_delete: false,
      },
      _ => ProviderCapabilitiesModel {
        can_listen: true,
        can_reply: true,
        can_delete: true,
      },
    },
  }
}
