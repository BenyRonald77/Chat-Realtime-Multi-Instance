import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getOnlineUserIds } from "@/lib/presence";
import { getRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const ids = new URL(request.url).searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const onlineIds = await getOnlineUserIds(getRedisClient(), ids);
  return NextResponse.json({ onlineIds });
}
