/**
 * Dependency-free static server for the Milestone 2 chat shell.
 *
 * Usage: node apps/web/server.mjs
 * Env:   UNJOT_WEB_PORT (default 5173), UNJOT_WEB_HOST (default 127.0.0.1)
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.UNJOT_WEB_PORT ?? 5173);
const host = process.env.UNJOT_WEB_HOST ?? "127.0.0.1";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Resolve a request path inside rootDir, or null when it escapes the root. */
function resolveTarget(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = resolve(join(rootDir, normalize(relative)));
  if (target !== rootDir && !target.startsWith(rootDir + sep)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end("Method Not Allowed");
    return;
  }

  const target = resolveTarget(request.url ?? "/");
  if (target === null) {
    response.writeHead(400).end("Bad Request");
    return;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not Found");
  }
});

server.listen(port, host, () => {
  const { address, port: boundPort } = server.address();
  console.log(`Unjot M2 chat shell → http://${address}:${boundPort}`);
  console.log("Ctrl+C to stop.");
});
