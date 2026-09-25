import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";

type Result = { session: SessionPayload } | { response: NextResponse };

export async function requireSession(): Promise<Result> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Belum login" }, { status: 401 }) };
  }
  return { session };
}
