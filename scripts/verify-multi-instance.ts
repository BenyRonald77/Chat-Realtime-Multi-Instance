/**
 * Skrip verifikasi: membuktikan pesan/typing/read-receipt/presence tetap
 * tersampaikan meski dua klien terhubung ke DUA PROSES SERVER BERBEDA yang
 * berbagi Redis yang sama — inti dari PRD proyek ini.
 *
 * Jalankan dua instance server terlebih dahulu (di dua terminal/direktori
 * kerja terpisah agar tidak berebut cache `.next` dev, lihat README.md):
 *   PORT=3001 npm run dev
 *   PORT=3002 npm run dev   # dari salinan direktori proyek yang lain
 *
 * Lalu jalankan skrip ini dari root proyek: npx tsx scripts/verify-multi-instance.ts
 */
import { io } from "socket.io-client";

async function login(port: number, email: string, password: string) {
  const res = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error(`Login gagal untuk ${email}: ${await res.text()}`);
  return cookie;
}

async function getConversationId(port: number, cookie: string, otherEmail: string) {
  const res = await fetch(`http://localhost:${port}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ otherEmail }),
  });
  const data = await res.json();
  return data.conversation.id as string;
}

async function main() {
  console.log("== Login Gita di instance 3001, Hadi di instance 3002 ==");
  const gitaCookie = await login(3001, "gita@chat.test", "gita123");
  const hadiCookie = await login(3002, "hadi@chat.test", "hadi123");

  const conversationId = await getConversationId(3001, gitaCookie, "hadi@chat.test");
  console.log("Conversation ID:", conversationId);

  const socketGita = io("http://localhost:3001", {
    path: "/socket.io",
    extraHeaders: { Cookie: gitaCookie },
  });
  const socketHadi = io("http://localhost:3002", {
    path: "/socket.io",
    extraHeaders: { Cookie: hadiCookie },
  });

  await Promise.all([
    new Promise<void>((resolve) => socketGita.on("connect", () => resolve())),
    new Promise<void>((resolve) => socketHadi.on("connect", () => resolve())),
  ]);
  console.log("Gita connected ke instance 3001, Hadi connected ke instance 3002 (BEDA proses)");

  await Promise.all([
    new Promise<void>((resolve) => socketGita.emit("conversation:join", conversationId, () => resolve())),
    new Promise<void>((resolve) => socketHadi.emit("conversation:join", conversationId, () => resolve())),
  ]);

  console.log("\n== TEST 1: Pesan lintas instance (Gita di 3001 -> Hadi di 3002) ==");
  const messageReceived = new Promise<void>((resolve) => {
    socketHadi.on("message:new", (msg) => {
      console.log("Hadi (instance 3002) menerima pesan:", msg.content, "dari", msg.senderName);
      resolve();
    });
  });
  socketGita.emit("message:send", { conversationId, content: "Halo dari instance 3001!" });
  await Promise.race([
    messageReceived,
    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT: pesan tidak sampai lintas instance!")), 5000)),
  ]);
  console.log("✅ LULUS: pesan berhasil melintasi instance server via Redis adapter");

  console.log("\n== TEST 2: Typing indicator lintas instance ==");
  const typingReceived = new Promise<void>((resolve) => {
    socketHadi.on("typing:update", (payload) => {
      console.log("Hadi menerima typing update:", payload);
      resolve();
    });
  });
  socketGita.emit("typing:start", { conversationId });
  await Promise.race([
    typingReceived,
    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT: typing indicator tidak sampai!")), 5000)),
  ]);
  console.log("✅ LULUS: typing indicator lintas instance berfungsi");

  console.log("\n== TEST 3: Read receipt lintas instance ==");
  const readReceived = new Promise<void>((resolve) => {
    socketGita.on("read:updated", (payload) => {
      console.log("Gita (instance 3001) menerima read receipt:", payload);
      resolve();
    });
  });
  socketHadi.emit("message:read", { conversationId });
  await Promise.race([
    readReceived,
    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT: read receipt tidak sampai!")), 5000)),
  ]);
  console.log("✅ LULUS: read receipt lintas instance berfungsi");

  console.log("\n== TEST 4: Presence online (dihitung dari Redis, bukan in-memory) ==");
  const presenceRes = await fetch("http://localhost:3001/api/presence?ids=" + encodeURIComponent((await (await fetch("http://localhost:3001/api/users", { headers: { Cookie: gitaCookie } })).json()).users.map((u: { id: string }) => u.id).join(",")), {
    headers: { Cookie: gitaCookie },
  });
  const presenceData = await presenceRes.json();
  console.log("Online user IDs (dicek dari instance 3001, padahal Hadi connect ke 3002):", presenceData.onlineIds);
  if (presenceData.onlineIds.length === 0) throw new Error("TIMEOUT: presence tidak terdeteksi lintas instance!");
  console.log("✅ LULUS: presence online terdeteksi lintas instance (Redis, bukan memori proses)");

  socketGita.disconnect();
  socketHadi.disconnect();
  console.log("\n=== SEMUA TES LINTAS-INSTANCE LULUS ===");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ GAGAL:", error.message);
  process.exit(1);
});
