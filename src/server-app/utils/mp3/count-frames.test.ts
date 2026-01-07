import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  countFrames,
  parseFrameHeader,
  readUInt32BE,
  skipID3Tag,
} from "./count-frames";

describe("MP3 Frame Counter", () => {
  const sampleMp3 = "./src/server-app/__fixtures__/sample.mp3";
  const favorMp3 =
    "./src/server-app/__fixtures__/Vindata, Skrillex, NSTASIA - Favor.mp3";
  let tempDir: string;

  afterAll(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  const buildHeader = (
    overrides: {
      sync?: number;
      version?: number;
      layer?: number;
      protection?: number;
      bitrateIndex?: number;
      sampleRateIndex?: number;
      padding?: number;
    } = {},
  ) => {
    const {
      sync = 0x7ff,
      version = 0b11,
      layer = 0b01,
      protection = 0b1,
      bitrateIndex = 0b1001,
      sampleRateIndex = 0b00,
      padding = 0b0,
    } = overrides;

    return (
      (sync << 21) |
      (version << 19) |
      (layer << 17) |
      (protection << 16) |
      (bitrateIndex << 12) |
      (sampleRateIndex << 10) |
      (padding << 9)
    );
  };

  it("counts frames in sample MP3 files", async () => {
    // Reference values from ffprobe
    expect(await countFrames(sampleMp3)).toBe(6089);
    expect(await countFrames(favorMp3)).toBe(8533);
  });

  it("skips ID3 tags and parses valid frame headers", async () => {
    const file = await open(sampleMp3, "r");
    const { size } = await file.stat();
    const position = await skipID3Tag(file, 0, size);
    const header = await readUInt32BE(file, position);
    await file.close();

    expect(parseFrameHeader(header)).not.toBeNull();
  });

  it("parses valid headers and rejects invalid ones per MPEG-1 Layer III spec", () => {
    expect(parseFrameHeader(buildHeader())).toEqual({
      bitrate: 128,
      sampleRate: 44100,
      padding: 0,
    });

    // Test spec violations: sync, version, layer, bitrate, sample rate
    [
      { sync: 0x7fe },
      { version: 0b10 },
      { layer: 0b10 },
      { bitrateIndex: 0b0000 },
      { bitrateIndex: 0b1111 },
      { sampleRateIndex: 0b11 },
    ].forEach((override) => {
      expect(parseFrameHeader(buildHeader(override))).toBeNull();
    });
  });

  it("returns 0 when file has fewer than 4 bytes", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "count-frames-"));
    const filePath = join(tempDir, "short.mp3");
    await writeFile(filePath, Buffer.from([0x12, 0x34]));

    const file = await open(filePath, "r");
    const value = await readUInt32BE(file, 0);
    await file.close();

    expect(value).toBe(0);
  });
});
