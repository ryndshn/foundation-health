import { serve } from "@hono/node-server";
import app from "./server-app/index";

const port = Number(process.env.PORT) || 3000;

console.log(`Server is running on http://localhost:${port}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down gracefully...");
  server.close();
  process.exit(0);
});
