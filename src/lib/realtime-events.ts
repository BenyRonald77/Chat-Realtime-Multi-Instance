export const ChatEvent = {
  JOIN_CONVERSATION: "conversation:join",
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_READ: "message:read",
  READ_UPDATED: "read:updated",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  TYPING_UPDATE: "typing:update",
  PRESENCE_UPDATE: "presence:update",
} as const;
export type ChatEvent = (typeof ChatEvent)[keyof typeof ChatEvent];
