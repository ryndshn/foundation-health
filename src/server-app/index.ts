import { Hono } from "hono";
import { unlink } from "node:fs/promises";
import { countFrames } from "./utils/mp3/count-frames";
import { streamUploadToDisk } from "./utils/upload";

const app = new Hono();

app.get("/api", (c) => c.json({ name: "Node.js" }));

app.post("/file-upload", async (c) => {
  try {
    const filepath = await streamUploadToDisk(c.req.raw);
    const frameCount = await countFrames(filepath);
    await unlink(filepath);

    return c.json({ frameCount });
  } catch (err) {
    const error = err as Error;
    return c.json({ error: error.message }, 400);
  }
});

export default app;
