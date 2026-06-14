/**
 * Connection Error Messages
 *
 * Centralized error messages for connection-related errors.
 * Maps error codes to user-friendly messages with title, message, and action.
 */

import { ConnectionErrorCode, ConnectionErrorCodeType } from "./connection-error.service";
import { PlatformType } from "@models/chat.model";

export interface UserFriendlyMessage {
  title: string;
  message: string;
  action: string;
}

export const USER_FRIENDLY_MESSAGES: Record<
  ConnectionErrorCodeType,
  UserFriendlyMessage
> = {
  [ConnectionErrorCode.AUTH_TOKEN_EXPIRED]: {
    title: "Authentication Expired",
    message: "Your connection has expired. Please reconnect your account.",
    action: "Reconnect in Settings",
  },
  [ConnectionErrorCode.AUTH_TOKEN_INVALID]: {
    title: "Invalid Authentication",
    message:
      "Your authentication token is no longer valid. This may happen if you changed your password or revoked access.",
    action: "Reconnect in Settings",
  },
  [ConnectionErrorCode.AUTH_SCOPE_MISSING]: {
    title: "Missing Permissions",
    message:
      "Required permissions are missing from your account. The OAuth token doesn't have all required scopes.",
    action: "Reconnect with Full Permissions",
  },
  [ConnectionErrorCode.AUTH_FAILED]: {
    title: "Authentication Failed",
    message:
      "Unable to authenticate with the platform. Check your credentials and ensure the OAuth app is properly configured.",
    action: "Check Credentials and Reconnect",
  },
  [ConnectionErrorCode.AUTH_CREDENTIALS_MISSING]: {
    title: "OAuth Credentials Missing",
    message:
      "The application is missing OAuth credentials for this platform. Please configure the credentials in the .env file or environment variables.",
    action: "Configure OAuth Credentials",
  },
  [ConnectionErrorCode.NETWORK_OFFLINE]: {
    title: "No Internet Connection",
    message: "Checking your internet connection...",
    action: "Check Network Settings",
  },
  [ConnectionErrorCode.NETWORK_TIMEOUT]: {
    title: "Connection Timeout",
    message: "The connection took too long to respond. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.NETWORK_UNREACHABLE]: {
    title: "Network Unreachable",
    message: "Unable to reach the platform. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.WEBSOCKET_CLOSED]: {
    title: "Connection Closed",
    message: "The chat connection was closed unexpectedly.",
    action: "Reconnecting...",
  },
  [ConnectionErrorCode.WEBSOCKET_ERROR]: {
    title: "Connection Error",
    message: "A connection error occurred. Attempting to reconnect...",
    action: "Reconnecting...",
  },
  [ConnectionErrorCode.PLATFORM_RATE_LIMITED]: {
    title: "Rate Limited",
    message: "Too many requests. Waiting before retry...",
    action: "Waiting to Retry",
  },
  [ConnectionErrorCode.PLATFORM_UNAVAILABLE]: {
    title: "Platform Unavailable",
    message: "The platform is temporarily unavailable. Please try again later.",
    action: "Try Again Later",
  },
  [ConnectionErrorCode.CHANNEL_NOT_FOUND]: {
    title: "Channel Not Found",
    message: "This channel doesn't exist or has been deleted.",
    action: "Verify Channel Name",
  },
  [ConnectionErrorCode.CHANNEL_BANNED]: {
    title: "Channel Suspended",
    message: "This channel has been suspended or banned.",
    action: "Contact Support",
  },
  [ConnectionErrorCode.UNKNOWN]: {
    title: "Connection Issue",
    message: "An unexpected error occurred. Retrying...",
    action: "Retrying Automatically",
  },
  [ConnectionErrorCode.INTERNAL_ERROR]: {
    title: "Internal Error",
    message: "An internal error occurred. Please try restarting the application.",
    action: "Restart Application",
  },
};

export const PLATFORM_NAMES: Record<PlatformType, string> = {
  twitch: "Twitch",
  kick: "Kick",
  youtube: "YouTube",
};