/**
 * Web Worker for message parsing and sanitization
 *
 * Offloads expensive message processing to a background thread
 * to prevent UI blocking during high-traffic scenarios (1000+ msg/min)
 */

/// <reference lib="webworker" />

import { ChatMessage } from "../models/chat.model";

interface ParseMessageRequest {
  type: "parse";
  payload: {
    message: ChatMessage;
    options: ParseOptions;
  };
}

interface BatchParseRequest {
  type: "batch-parse";
  payload: {
    messages: ChatMessage[];
    options: ParseOptions;
  };
}

interface ParseOptions {
  sanitizeHtml: boolean;
  extractEmotes: boolean;
  extractLinks: boolean;
}

interface ParseMessageResponse {
  type: "parse-result";
  payload: {
    messageId: string;
    result: ParsedMessage;
    processingTime: number;
  };
}

interface BatchParseResponse {
  type: "batch-parse-result";
  payload: {
    results: Array<{ messageId: string; result: ParsedMessage; processingTime: number }>;
    totalProcessingTime: number;
  };
}

interface ParsedMessage {
  text: string;
  segments: Array<{ type: string; value: string }>;
  emotes: Array<{ id: string; code: string }>;
  links: Array<{ url: string; text: string }>;
}

// HTML escape map
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<>"'()[\]]+|www\.[^\s<>"'()[\]]+/gi;

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Extract URLs from text
 */
function extractLinks(text: string): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0];
    links.push({
      url: url.startsWith("www.") ? `https://${url}` : url,
      text: url,
    });
  }

  return links;
}

/**
 * Parse a single message
 */
function parseMessage(message: ChatMessage, options: ParseOptions): ParsedMessage {
  const startTime = performance.now();

  let text = message.text ?? "";
  const segments: Array<{ type: string; value: string }> = [];
  const emotes: Array<{ id: string; code: string }> = [];
  const links: Array<{ url: string; text: string }> = [];

  // Sanitize HTML if requested
  if (options.sanitizeHtml) {
    text = escapeHtml(text);
  }

  // Extract links if requested
  if (options.extractLinks) {
    links.push(...extractLinks(text));
  }

  // Extract emotes if requested
  if (options.extractEmotes && message.rawPayload?.emotes) {
    emotes.push(
      ...message.rawPayload.emotes.map((emote) => ({
        id: emote.id,
        code: emote.code,
      }))
    );
  }

  // Build segments
  segments.push({ type: "text", value: text });

  const processingTime = performance.now() - startTime;

  return {
    text,
    segments,
    emotes,
    links,
  };
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = (event: MessageEvent<ParseMessageRequest | BatchParseRequest>) => {
  try {
    const { type, payload } = event.data;

    if (type === "parse") {
      const { message, options } = payload;
      const startTime = performance.now();

      const result = parseMessage(message, options);

      const response: ParseMessageResponse = {
        type: "parse-result",
        payload: {
          messageId: message.id,
          result,
          processingTime: performance.now() - startTime,
        },
      };

      self.postMessage(response);
    } else if (type === "batch-parse") {
      const { messages, options } = payload;
      const startTime = performance.now();

      const results = messages.map((message) => ({
        messageId: message.id,
        result: parseMessage(message, options),
        processingTime: 0, // Individual timing not tracked in batch
      }));

      const totalProcessingTime = performance.now() - startTime;

      const response: BatchParseResponse = {
        type: "batch-parse-result",
        payload: {
          results,
          totalProcessingTime,
        },
      };

      self.postMessage(response);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      payload: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};

export default self;
