import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Server siap di http://localhost:${port} (pid ${process.pid})`);
  });
});
