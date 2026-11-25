/**
 * RadVision Zero-Dependency Node.js Static Web Server
 * Serves the Progressive Medical Image Preprocessing & Enhancement Workstation
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8000;
const HOST = "127.0.0.1";
const STATIC_DIR = path.join(__dirname, "static");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".dcm": "application/dicom"
};

const server = http.createServer((req, res) => {
  const cleanUrl = (req.url || "/").split("?")[0];
  let filePath;

  if (cleanUrl === "/") {
    filePath = path.join(STATIC_DIR, "index.html");
  } else if (cleanUrl.startsWith("/static/")) {
    filePath = path.join(__dirname, cleanUrl);
  } else {
    filePath = path.join(STATIC_DIR, cleanUrl);
  }

  // Prevent directory traversal outside workspace
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("403 Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain" });
      return res.end(err.code === "ENOENT" ? "404 Not Found" : "500 Server Error");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log("=".repeat(68));
  console.log("  RADVISION | Pure HTML/CSS/JS Medical Image Workstation");
  console.log(`  Running at: http://${HOST}:${PORT}`);
  console.log("  Press Ctrl+C to stop the server.");
  console.log("=".repeat(68));
});
