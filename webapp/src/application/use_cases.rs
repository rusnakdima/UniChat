//! Application Use Cases
//!
//! These use cases encapsulate the application's business rules and
//! coordinate domain entities and infrastructure services.

use crate::domain::entities::*;
use crate::domain::services::*;

/// Use case for sending a chat message.
pub struct SendMessageUseCase {
    room_service: ChatRoomService,
}

#[allow(dead_code)]
impl SendMessageUseCase {
    pub fn new() -> Self {
        Self {
            room_service: ChatRoomService::new(),
        }
    }

    pub fn execute(&self, message: &mut ChatMessage) -> Result<(), String> {
        self.room_service.send_message(message)
    }
}

impl Default for SendMessageUseCase {
    fn default() -> Self {
        Self::new()
    }
}

/// Use case for joining a chat room.
pub struct JoinRoomUseCase {
    room_service: ChatRoomService,
}

#[allow(dead_code)]
impl JoinRoomUseCase {
    pub fn new() -> Self {
        Self {
            room_service: ChatRoomService::new(),
        }
    }

    pub fn execute(&self, channel: ChatChannel, account: &ChatAccount) -> Result<(), String> {
        self.room_service.join_room(channel, account)
    }
}

impl Default for JoinRoomUseCase {
    fn default() -> Self {
        Self::new()
    }
}

/// Use case for leaving a chat room.
pub struct LeaveRoomUseCase {
    room_service: ChatRoomService,
}

#[allow(dead_code)]
impl LeaveRoomUseCase {
    pub fn new() -> Self {
        Self {
            room_service: ChatRoomService::new(),
        }
    }

    pub fn execute(&self, channel: &ChatChannel) -> Result<(), String> {
        self.room_service.leave_room(channel)
    }
}

impl Default for LeaveRoomUseCase {
    fn default() -> Self {
        Self::new()
    }
}

/// Use case for checking connection status.
pub struct ConnectionStatusUseCase {
    connection_service: ConnectionService,
}

#[allow(dead_code)]
impl ConnectionStatusUseCase {
    pub fn new() -> Self {
        Self {
            connection_service: ConnectionService::new(),
        }
    }

    pub fn is_connected(&self, platform: &Platform) -> bool {
        self.connection_service.is_connected(platform)
    }

    pub fn get_status(&self, platform: &Platform) -> AuthStatus {
        self.connection_service.get_status(platform)
    }
}

impl Default for ConnectionStatusUseCase {
    fn default() -> Self {
        Self::new()
    }
}
