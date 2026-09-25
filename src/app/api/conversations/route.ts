import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ChatError, findOrCreateDirectConversation, listConversationsForUser } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const conversations = await listConversationsForUser(auth.session.sub);
  return NextResponse.json({ conversations });
}

const schema = z.object({ otherEmail: z.string().email() });

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }

  const otherUser = await prisma.user.findUnique({ where: { email: parsed.data.otherEmail } });
  if (!otherUser) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  try {
    const conversation = await findOrCreateDirectConversation(auth.session.sub, otherUser.id);
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof ChatError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
