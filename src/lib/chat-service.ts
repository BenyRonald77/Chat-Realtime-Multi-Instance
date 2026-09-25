import { prisma } from "@/lib/prisma";

export class ChatError extends Error {}

export async function findOrCreateDirectConversation(userAId: string, userBId: string) {
  if (userAId === userBId) throw new ChatError("Tidak bisa membuat percakapan dengan diri sendiri");

  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: userAId } } },
        { participants: { some: { userId: userBId } } },
      ],
    },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      isGroup: false,
      participants: { create: [{ userId: userAId }, { userId: userBId }] },
    },
  });
}

export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return Boolean(participant);
}

export async function getParticipantIds(conversationId: string): Promise<string[]> {
  const rows = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function listConversationsForUser(userId: string) {
  const participations = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: { id: true, name: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const results = await Promise.all(
    participations.map(async (p) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          createdAt: p.lastReadAt ? { gt: p.lastReadAt } : undefined,
        },
      });

      const otherParticipants = p.conversation.participants
        .filter((cp) => cp.userId !== userId)
        .map((cp) => ({ id: cp.user.id, name: cp.user.name }));

      return {
        id: p.conversation.id,
        title: p.conversation.title ?? otherParticipants.map((o) => o.name).join(", "),
        participants: otherParticipants,
        lastMessage: p.conversation.messages[0]
          ? {
              content: p.conversation.messages[0].content,
              createdAt: p.conversation.messages[0].createdAt,
              senderId: p.conversation.messages[0].senderId,
            }
          : null,
        unreadCount,
      };
    }),
  );

  return results.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
    const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
    return bTime - aTime;
  });
}

/** Cursor pagination: cursor = id pesan terakhir yang sudah dimuat client. */
export async function listMessages(conversationId: string, cursor?: string, limit = 30) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { sender: { select: { id: true, name: true } } },
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: page.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      senderId: m.sender.id,
      senderName: m.sender.name,
    })),
    nextCursor: hasMore ? page[0].id : null,
  };
}

export async function createMessage(conversationId: string, senderId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new ChatError("Pesan tidak boleh kosong");
  if (trimmed.length > 4000) throw new ChatError("Pesan terlalu panjang");

  const message = await prisma.message.create({
    data: { conversationId, senderId, content: trimmed },
    include: { sender: { select: { id: true, name: true } } },
  });

  return {
    id: message.id,
    conversationId,
    content: message.content,
    createdAt: message.createdAt,
    senderId: message.sender.id,
    senderName: message.sender.name,
  };
}

export async function markConversationRead(conversationId: string, userId: string) {
  const readAt = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: readAt },
  });
  return readAt;
}
