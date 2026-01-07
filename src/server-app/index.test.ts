import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { serve } from "@hono/node-server";
import app from "./index";

describe("File Upload Endpoint", () => {
  const server = serve({ fetch: app.fetch, port: 0 });
  const baseURL = `http://localhost:${(server.address() as any).port}`;

  it("should accept file upload", async () => {
    const response = await request(baseURL)
      .post("/file-upload")
      .attach("file", Buffer.from("fake mp3 data"), "test.mp3");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("frameCount");
  });

  it("should return error when no file uploaded", async () => {
    const response = await request(baseURL).post("/file-upload");

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
  });

  it("should count frames in real MP3 file", async () => {
    const mp3Buffer = await readFile(
      "./src/server-app/__fixtures__/sample.mp3",
    );

    const response = await request(baseURL)
      .post("/file-upload")
      .attach("file", mp3Buffer, "sample.mp3");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("frameCount");

    // TODO: Verify exact frame count once implementation is complete
    // Run: mediainfo --fullscan ./src/server-app/__fixtures__/sample.mp3
    // Expected frame count: TBD
    expect(response.body.frameCount).toBeGreaterThan(0);
  });
});
