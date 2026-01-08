import { Hono } from "hono";
import { unlink } from "node:fs/promises";
import { countFrames } from "./utils/mp3/count-frames";
import { streamUploadToDisk } from "./utils/upload";

const app = new Hono();

app.get("/health", (c) => c.body("server is running 👍"));

app.post("/file-upload", async (c) => {
  try {
    // NOTE: it seems that it is possible to stream and process the file
    // without storing it on disk first, but for simplicity we'll store it temporarily
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
