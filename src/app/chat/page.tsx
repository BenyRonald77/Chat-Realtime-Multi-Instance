"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { getSocket } from "@/lib/socket-client";
import { ChatEvent } from "@/lib/realtime-events";

type ConversationSummary = {
  id: string;
  title: string;
  participants: { id: string; name: string }[];
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

type Message = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderName: string;
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const { me, checking } = useAuthGuard();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [newChatEmail, setNewChatEmail] = useState("");
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data: { conversations: ConversationSummary[] } = await res.json();
    setConversations(data.conversations);

    const allParticipantIds = Array.from(
      new Set(data.conversations.flatMap((c) => c.participants.map((p) => p.id))),
    );
    if (allParticipantIds.length > 0) {
      const presRes = await fetch(`/api/presence?ids=${allParticipantIds.join(",")}`);
      if (presRes.ok) {
        const presData = await presRes.json();
        setOnlineIds(new Set(presData.onlineIds));
      }
    }
  }, []);

  useEffect(() => {
    if (me) loadConversations();
  }, [me, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string, cursor?: string) => {
    const url = cursor
      ? `/api/conversations/${conversationId}/messages?cursor=${cursor}`
      : `/api/conversations/${conversationId}/messages`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data: { messages: Message[]; nextCursor: string | null } = await res.json();
    if (cursor) {
      setMessages((prev) => [...data.messages, ...prev]);
    } else {
      setMessages(data.messages);
    }
    setNextCursor(data.nextCursor);
  }, []);

  async function openConversation(id: string) {
    setActiveId(id);
    await loadMessages(id);
    getSocket().emit(ChatEvent.JOIN_CONVERSATION, id);
    getSocket().emit(ChatEvent.MESSAGE_READ, { conversationId: id });
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
  }

  useEffect(() => {
    if (!me) return;
    const socket = getSocket();

    const onNewMessage = (message: Message & { conversationId: string }) => {
      if (message.conversationId === activeId) {
        setMessages((prev) => [...prev, message]);
        socket.emit(ChatEvent.MESSAGE_READ, { conversationId: activeId });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
      loadConversations();
    };

    const onTyping = (payload: { conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
      if (payload.conversationId !== activeId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.isTyping) next[payload.userId] = payload.userName;
        else delete next[payload.userId];
        return next;
      });
    };

    const onPresence = (payload: { userId: string; online: boolean }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (payload.online) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    };

    socket.on(ChatEvent.MESSAGE_NEW, onNewMessage);
    socket.on(ChatEvent.TYPING_UPDATE, onTyping);
    socket.on(ChatEvent.PRESENCE_UPDATE, onPresence);

    return () => {
      socket.off(ChatEvent.MESSAGE_NEW, onNewMessage);
      socket.off(ChatEvent.TYPING_UPDATE, onTyping);
      socket.off(ChatEvent.PRESENCE_UPDATE, onPresence);
    };
  }, [me, activeId, loadConversations]);

  function handleTyping() {
    if (!activeId) return;
    const socket = getSocket();
    socket.emit(ChatEvent.TYPING_START, { conversationId: activeId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit(ChatEvent.TYPING_STOP, { conversationId: activeId });
    }, 2000);
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!activeId || !input.trim()) return;
    getSocket().emit(
      ChatEvent.MESSAGE_SEND,
      { conversationId: activeId, content: input },
      (result: { ok: boolean; error?: string }) => {
        if (!result.ok) setError(result.error ?? "Gagal mengirim pesan");
      },
    );
    setInput("");
    getSocket().emit(ChatEvent.TYPING_STOP, { conversationId: activeId });
  }

  async function handleStartChat(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherEmail: newChatEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Gagal memulai chat");
      return;
    }
    setNewChatEmail("");
    await loadConversations();
    await openConversation(data.conversation.id);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  const activeConversation = conversations.find((c) => c.id === activeId);
  const typingNames = Object.values(typingUsers);

  return (
    <main className="mx-auto flex h-screen max-w-5xl">
      <aside className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <span className="text-sm font-medium text-slate-700">{me.name}</span>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-rose-600">
            Keluar
          </button>
        </div>

        <form onSubmit={handleStartChat} className="border-b border-slate-200 p-3">
          <input
            value={newChatEmail}
            onChange={(e) => setNewChatEmail(e.target.value)}
            placeholder="Email untuk chat baru"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </form>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const other = c.participants[0];
            const isOnline = other && onlineIds.has(other.id);
            return (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                  activeId === c.id ? "bg-brand-50" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {c.title}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">{c.unreadCount}</span>
                  )}
                </div>
                {c.lastMessage && (
                  <span className="truncate text-xs text-slate-400">{c.lastMessage.content}</span>
                )}
              </button>
            );
          })}
          {conversations.length === 0 && (
            <p className="p-4 text-center text-sm text-slate-400">Belum ada percakapan.</p>
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col">
        {activeConversation ? (
          <>
            <header className="border-b border-slate-200 bg-white px-6 py-3">
              <h2 className="font-semibold text-slate-800">{activeConversation.title}</h2>
              {typingNames.length > 0 && (
                <p className="text-xs italic text-brand-600">{typingNames.join(", ")} sedang mengetik...</p>
              )}
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
              {nextCursor && (
                <button
                  onClick={() => loadMessages(activeId!, nextCursor)}
                  className="mb-4 w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs text-slate-500 hover:bg-slate-100"
                >
                  Muat pesan lama
                </button>
              )}
              <div className="flex flex-col gap-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                      m.senderId === me.id ? "self-end bg-brand-600 text-white" : "self-start bg-white text-slate-800"
                    }`}
                  >
                    {m.senderId !== me.id && <p className="text-xs font-medium text-brand-600">{m.senderName}</p>}
                    <p>{m.content}</p>
                    <p className={`mt-0.5 text-right text-[10px] ${m.senderId === me.id ? "text-brand-100" : "text-slate-400"}`}>
                      {formatTime(m.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="px-6 py-1 text-xs text-rose-600">{error}</p>}

            <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-200 bg-white p-4">
              <input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleTyping();
                }}
                placeholder="Tulis pesan..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Kirim
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Pilih atau mulai percakapan
          </div>
        )}
      </section>
    </main>
  );
}
