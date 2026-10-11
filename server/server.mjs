import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicRoot = join(root, "public");
const meetingsRoot = join(root, "data", "meetings");
const mediaRoot = join(root, "media");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".srt": "application/x-subrip; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!match) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function resolveStaticFile(requestPath) {
  const meetingRoute = /^\/meetings\/[^/]+\/?$/.test(requestPath);
  let staticRoot = publicRoot;
  let relativePath = requestPath === "/"
    ? "index.html"
    : meetingRoute
      ? "meeting.html"
      : requestPath.replace(/^\/+/, "");

  if (requestPath.startsWith("/data/meetings/")) {
    staticRoot = meetingsRoot;
    relativePath = requestPath.slice("/data/meetings/".length);
  } else if (requestPath.startsWith("/media/")) {
    staticRoot = mediaRoot;
    relativePath = requestPath.slice("/media/".length);
  }

  const filePath = resolve(staticRoot, relativePath);
  const rootPrefix = `${resolve(staticRoot)}${sep}`;
  if (filePath !== resolve(staticRoot) && !filePath.startsWith(rootPrefix)) return null;
  return filePath;
}

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const requestPath = decodeURIComponent(requestUrl.pathname);
    const filePath = resolveStaticFile(requestPath);

    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    const contentType = mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": contentType
    };
    const requestedRange = request.headers.range;

    if (requestedRange) {
      const range = parseRange(requestedRange, fileStat.size);
      if (!range) {
        response.writeHead(416, {
          ...baseHeaders,
          "Content-Range": `bytes */${fileStat.size}`
        });
        response.end();
        return;
      }

      response.writeHead(206, {
        ...baseHeaders,
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      createReadStream(filePath, range).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...baseHeaders,
      "Content-Length": fileStat.size
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`EthLens is running at http://127.0.0.1:${port}`);
});
