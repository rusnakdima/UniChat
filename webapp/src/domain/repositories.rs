//! Domain Repositories - UniChat

pub mod channels {
    use serde::{Deserialize, Serialize};

    #[derive(Default, Debug, Clone, Serialize, Deserialize)]
    #[allow(dead_code)]
    pub struct Channel {
        pub channel_name: String,
        pub platform: String,
    }

    #[derive(Default)]
    #[allow(dead_code)]
    pub struct ChannelsState {
        pub channels: Vec<Channel>,
    }

    #[allow(dead_code)]
    pub fn use_channels() -> ChannelsState {
        ChannelsState::default()
    }
}

pub mod dashboard_preferences {
    #[derive(Default)]
    #[allow(dead_code)]
    pub struct DashboardPreferences {
        pub show_online_status: bool,
        pub density_mode: String,
        pub feed_mode: String,
        pub auto_scroll: bool,
    }

    #[allow(dead_code)]
    pub fn use_dashboard_preferences() -> DashboardPreferences {
        DashboardPreferences {
            show_online_status: true,
            density_mode: "compact".into(),
            feed_mode: "all".into(),
            auto_scroll: true,
        }
    }
}

pub use channels::*;
pub use dashboard_preferences::*;
