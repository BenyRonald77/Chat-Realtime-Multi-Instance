import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/session-token";

export {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
  type SessionPayload,
};

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  return valid ? user : null;
}
