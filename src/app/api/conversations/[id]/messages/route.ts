import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isParticipant, listMessages } from "@/lib/chat-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const allowed = await isParticipant(params.id, auth.session.sub);
  if (!allowed) {
    return NextResponse.json({ error: "Anda bukan partisipan percakapan ini" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? 30);

  const result = await listMessages(params.id, cursor, limit);
  return NextResponse.json(result);
}
