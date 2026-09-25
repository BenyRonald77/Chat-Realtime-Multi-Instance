import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const users = await prisma.user.findMany({
    where: { id: { not: auth.session.sub } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}
