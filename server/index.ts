import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for the API: lets a script running on Instagram/TikTok/YouTube pages send audio
// directly with fetch() and read the JSON back, without leaving the page.
// ALLOWED_ORIGINS: comma-separated list; defaults to the three platforms.
// API_TOKEN (optional): if set, cross-origin requests must send it in the "x-api-token" header.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "https://www.instagram.com,https://www.tiktok.com,https://www.youtube.com")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    return next(); // same-origin (the site itself) or not allowed: normal behaviour
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  const token = process.env.API_TOKEN;
  if (token && req.headers["x-api-token"] !== token) {
    return res.status(401).json({ error: "Token inválido." });
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5007', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
