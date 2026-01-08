import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { serve } from "@hono/node-server";
import app from "./index";

describe("File Upload Endpoint", () => {
  const server = serve({ fetch: app.fetch, port: 0 });
  const address = server.address() as AddressInfo;
  const baseURL = `http://localhost:${address.port}`;

  it("should error on bad file", async () => {
    const response = await request(baseURL)
      .post("/file-upload")
      .attach("file", Buffer.from("fake mp3 data"), "test.mp3");

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("error");
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
    expect(response.body.frameCount).toBe(6089);
  });
});
