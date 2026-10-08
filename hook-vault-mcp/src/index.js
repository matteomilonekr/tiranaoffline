#!/usr/bin/env node
// Avvio del server. Default: stdio (Claude Desktop, Claude Code, Cursor).
// Con --http (o MCP_TRANSPORT=http) espone Streamable HTTP su /mcp per l'hosting.

import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { Store } from "./store.js";
import { ScrapeCreatorsClient } from "./scrapecreators.js";

const useHttp = process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";

async function startStdio() {
  const { server, store } = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`hook-vault MCP (stdio): ${store.hooks.length} ganci, ${store.videos.length} reel, dati utente in ${store.dataDir}`);
}

function authorized(req, token) {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Body troppo grande");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

async function startHttp() {
  const port = Number(process.env.PORT ?? 3333);
  const token = process.env.HOOK_VAULT_TOKEN;
  // Store e client sono condivisi; server e transport sono creati per ogni
  // richiesta (modalità stateless), come raccomandato dall'SDK.
  const store = new Store();
  const scraper = new ScrapeCreatorsClient();

  const http = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, hooks: store.hooks.length, videos: store.videos.length }));
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (!authorized(req, token)) {
      res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" }).end();
      return;
    }
    try {
      const body = await readJsonBody(req);
      const { server } = createServer({ store, scraper });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: String(err?.message ?? err) }, id: null }));
      }
    }
  });

  http.listen(port, () => {
    console.error(`hook-vault MCP (http) su http://localhost:${port}/mcp${token ? " (token richiesto)" : ""}`);
  });
}

(useHttp ? startHttp() : startStdio()).catch((err) => {
  console.error(err);
  process.exit(1);
});
