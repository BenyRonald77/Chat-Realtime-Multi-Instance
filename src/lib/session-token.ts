import jwt from "jsonwebtoken";

/**
 * Bagian dari auth.ts yang TIDAK menyentuh `next/headers` sama sekali,
 * sengaja dipisah agar bisa diimpor dengan aman oleh server/index.ts
 * (dijalankan langsung lewat tsx, di luar pipeline request Next.js).
 * Mengimpor sesuatu yang memuat `next/headers` di titik itu membuat Next
 * menginisialisasi modul internalnya dua kali dengan cara berbeda dan
 * memicu error "AsyncLocalStorage accessed in runtime where it is not
 * available" saat request pertama masuk.
 */
export const SESSION_COOKIE_NAME = "chat_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum diset di environment (.env)");
  return secret;
}

export type SessionPayload = { sub: string; name: string; email: string };

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
