import { open } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { countFrames } from "./count-frames";

describe("MP3 Frame Counter", () => {
  it("should count frames in sample MP3", async () => {
    const count = await countFrames("./src/server-app/__fixtures__/sample.mp3");
    console.log("Frame count:", count);
    expect(count).toBeGreaterThan(0);
  });

  it("should read first bytes correctly", async () => {
    const file = await open("./src/server-app/__fixtures__/sample.mp3", "r");
    const buf = Buffer.alloc(50);
    await file.read(buf, 0, 50, 0);
    await file.close();

    console.log("First 50 bytes:", buf.toString("hex"));
    console.log("First 3 bytes (should be ID3):", buf.subarray(0, 3).toString());
    console.log(
      "ID3 size bytes:",
      buf.subarray(6, 10).toString("hex"),
    );

    const tagSize =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    console.log("Calculated tag size:", tagSize);
    console.log("First frame should be at position:", 10 + tagSize);
  });

  it("should parse first frame header", async () => {
    const file = await open("./src/server-app/__fixtures__/sample.mp3", "r");
    const buf = Buffer.alloc(4);
    await file.read(buf, 0, 4, 44); // Read at position 44
    await file.close();

    const header = buf.readUInt32BE(0);
    console.log("Header hex:", buf.toString("hex"));
    console.log("Header uint32:", header.toString(16));
    console.log("Header binary:", header.toString(2).padStart(32, "0"));

    // Parse manually
    const sync = (header & 0xffe00000) >>> 21;
    const version = (header >>> 19) & 0b11;
    const layer = (header >>> 17) & 0b11;
    const bitrateIndex = (header >>> 12) & 0b1111;
    const sampleRateIndex = (header >>> 10) & 0b11;
    const padding = (header >>> 9) & 0b1;

    console.log("Sync:", sync.toString(16), "(should be 7FF)");
    console.log("Version:", version, "(should be 3 for MPEG-1)");
    console.log("Layer:", layer, "(should be 1 for Layer 3)");
    console.log("Bitrate index:", bitrateIndex);
    console.log("Sample rate index:", sampleRateIndex);
    console.log("Padding:", padding);
  });
});
