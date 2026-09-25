import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { verifySession, SESSION_COOKIE_NAME } from "../src/lib/session-token";
import { registerChatHandlers } from "./chat-handlers";

const port = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== "production";
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const app = next({ dev });
const handle = app.getRequestHandler();

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Dua koneksi Redis terpisah wajib untuk adapter Socket.IO (satu untuk
  // publish, satu untuk subscribe — batasan protokol Redis Pub/Sub), plus
  // satu koneksi lagi khusus untuk penghitung presence online.
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();
  const presenceClient = new Redis(redisUrl);

  const io = new SocketIOServer(httpServer, { path: "/socket.io" });
  io.adapter(createAdapter(pubClient, subClient));

  // Autentikasi koneksi WebSocket pakai cookie sesi yang sama dengan REST API.
  io.use((socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
    const session = token ? verifySession(token) : null;
    if (!session) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.data.userId = session.sub;
    socket.data.userName = session.name;
    next();
  });

  registerChatHandlers(io, presenceClient);

  httpServer.listen(port, () => {
    console.log(`> Server siap di http://localhost:${port} (pid ${process.pid})`);
    console.log(`> Redis adapter aktif: ${redisUrl}`);
  });
});
