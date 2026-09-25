import type { Server, Socket } from "socket.io";
import type Redis from "ioredis";
import { createMessage, isParticipant, markConversationRead } from "../src/lib/chat-service";
import { decrementPresence, incrementPresence } from "../src/lib/presence";
import { ChatEvent } from "../src/lib/realtime-events";

type AuthedSocket = Socket & { data: { userId: string; userName: string } };

/**
 * Semua broadcast di sini (io.to(room).emit / io.emit) otomatis tersampaikan
 * lintas instance server karena `io` sudah memakai Redis adapter (dipasang
 * di server/index.ts) — handler ini sendiri tidak perlu tahu apa-apa
 * tentang Redis untuk urusan broadcast pesan/typing/read receipt.
 */
export function registerChatHandlers(io: Server, presenceRedis: Redis) {
  io.on("connection", (socket) => {
    const authed = socket as AuthedSocket;
    const userId = authed.data.userId;

    // Room pribadi per user — dipakai untuk menyiarkan event yang relevan ke
    // SEMUA sesi/tab milik user ini tanpa perlu tahu socket id spesifiknya.
    socket.join(`user:${userId}`);

    void (async () => {
      const countAfterConnect = await incrementPresence(presenceRedis, userId);
      if (countAfterConnect === 1) {
        io.emit(ChatEvent.PRESENCE_UPDATE, { userId, online: true });
      }
    })();

    socket.on(ChatEvent.JOIN_CONVERSATION, async (conversationId: string, ack?: (ok: boolean) => void) => {
      const allowed = await isParticipant(conversationId, userId);
      if (!allowed) {
        ack?.(false);
        return;
      }
      socket.join(`conversation:${conversationId}`);
      ack?.(true);
    });

    socket.on(
      ChatEvent.MESSAGE_SEND,
      async (
        payload: { conversationId: string; content: string },
        ack?: (result: { ok: boolean; error?: string }) => void,
      ) => {
        try {
          const allowed = await isParticipant(payload.conversationId, userId);
          if (!allowed) throw new Error("Anda bukan partisipan percakapan ini");

          const message = await createMessage(payload.conversationId, userId, payload.content);
          io.to(`conversation:${payload.conversationId}`).emit(ChatEvent.MESSAGE_NEW, message);
          ack?.({ ok: true });
        } catch (error) {
          ack?.({ ok: false, error: error instanceof Error ? error.message : "Gagal mengirim pesan" });
        }
      },
    );

    socket.on(ChatEvent.MESSAGE_READ, async (payload: { conversationId: string }) => {
      const allowed = await isParticipant(payload.conversationId, userId);
      if (!allowed) return;
      const readAt = await markConversationRead(payload.conversationId, userId);
      io.to(`conversation:${payload.conversationId}`).emit(ChatEvent.READ_UPDATED, {
        conversationId: payload.conversationId,
        userId,
        readAt,
      });
    });

    socket.on(ChatEvent.TYPING_START, (payload: { conversationId: string }) => {
      socket.to(`conversation:${payload.conversationId}`).emit(ChatEvent.TYPING_UPDATE, {
        conversationId: payload.conversationId,
        userId,
        userName: authed.data.userName,
        isTyping: true,
      });
    });

    socket.on(ChatEvent.TYPING_STOP, (payload: { conversationId: string }) => {
      socket.to(`conversation:${payload.conversationId}`).emit(ChatEvent.TYPING_UPDATE, {
        conversationId: payload.conversationId,
        userId,
        userName: authed.data.userName,
        isTyping: false,
      });
    });

    socket.on("disconnect", async () => {
      const countAfterDisconnect = await decrementPresence(presenceRedis, userId);
      if (countAfterDisconnect === 0) {
        io.emit(ChatEvent.PRESENCE_UPDATE, { userId, online: false });
      }
    });
  });
}
