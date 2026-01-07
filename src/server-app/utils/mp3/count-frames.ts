/**
 * Counts the number of frames in an MP3 file (MPEG-1 Layer III).
 *
 * Algorithm:
 * 1. Skip ID3v2 tag if present at start of file
 * 2. Read 4-byte frame header
 * 3. Parse header to get bitrate, sample rate, padding
 * 4. Calculate frame length
 * 5. Jump to next frame, repeat until end of file
 */

import { open } from "node:fs/promises";
import { BITRATES, FRAME_LENGTH_MULTIPLIER, SAMPLE_RATES } from "./constants";

export async function countFrames(filePath: string): Promise<number> {
  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();
    if (size < 4) return 0;

    let position = 0;

    // Skip ID3v2 tag if present
    position = await skipID3Tag(file, position, size);

    // Skip Xing/Info VBR header frame if present
    // (industry standard: exclude metadata frames from audio frame count)
    position = await skipXingInfoFrame(file, position, size);

    // Count frames
    let frameCount = 0;

    while (position + 4 <= size) {
      const header = await readUInt32BE(file, position);
      const frame = parseFrameHeader(header);

      if (!frame) break; // Invalid frame, stop counting

      const frameLength =
        Math.floor(
          (FRAME_LENGTH_MULTIPLIER * 1000 * frame.bitrate) / frame.sampleRate,
        ) + frame.padding;

      if (frameLength <= 0 || position + frameLength > size) break;

      position += frameLength;
      frameCount++;
    }

    return frameCount;
  } finally {
    await file.close();
  }
}

/**
 * Parse MP3 frame header (4 bytes / 32 bits)
 *
 * Bit layout:
 * AAAAAAAA AAABBCCD EEEEFFGH IIJJKLMM
 *
 * A (11 bits): Frame sync (all 1s)
 * B (2 bits):  MPEG version
 * C (2 bits):  Layer
 * D (1 bit):   Protection
 * E (4 bits):  Bitrate index
 * F (2 bits):  Sample rate index
 * G (1 bit):   Padding
 * H-M:         Other flags (not needed for frame counting)
 */
export function parseFrameHeader(
  header: number,
): { bitrate: number; sampleRate: number; padding: number } | null {
  /**
   * Frame sync (bits 31–21, 11 bits)
   * - >>> 21 moves the top 11 bits to the bottom
   * - 0x7ff = 2047 = 0b11111111111 (11 ones)
   * - Valid MPEG frame sync must be all 1s
   */
  const sync = (header >>> 21) & 0x7ff;
  if (sync !== 0x7ff) return null;

  /**
   * MPEG Audio version ID (bits 20–19, 2 bits)
   * - 0b11 (3) indicates MPEG-1
   */
  const version = (header >>> 19) & 0b11;
  if (version !== 0b11) return null;

  /**
   * Layer description (bits 18–17, 2 bits)
   * - 0b01 (1) indicates Layer III
   */
  const layer = (header >>> 17) & 0b11;
  if (layer !== 0b01) return null;

  /**
   * Bitrate index (bits 15–12, 4 bits)
   * - 0b0000 = free format (invalid)
   * - 0b1111 = bad value (invalid)
   */
  const bitrateIndex = (header >>> 12) & 0b1111;
  if (bitrateIndex === 0b0000 || bitrateIndex === 0b1111) {
    return null;
  }

  /**
   * Sample rate index (bits 11–10, 2 bits)
   * - 0b11 is reserved / invalid
   */
  const sampleRateIndex = (header >>> 10) & 0b11;
  if (sampleRateIndex === 0b11) {
    return null;
  }

  /**
   * Padding flag (bit 9, 1 bit)
   * - 1 means frame includes an extra padding byte
   */
  const padding = (header >>> 9) & 0b1;

  // Lookup actual values from tables
  const bitrate = BITRATES[bitrateIndex];
  const sampleRate = SAMPLE_RATES[sampleRateIndex];

  if (!bitrate || !sampleRate) return null;

  return { bitrate, sampleRate, padding };
}

/**
 * Read a 32-bit unsigned integer (big-endian) from file
 */
export async function readUInt32BE(
  file: Awaited<ReturnType<typeof open>>,
  position: number,
): Promise<number> {
  const buffer = Buffer.alloc(4);
  const { bytesRead } = await file.read(buffer, 0, 4, position);
  return bytesRead === 4 ? buffer.readUInt32BE(0) : 0;
}

/**
 * Skip Xing/Info VBR header frame if present
 *
 * The Xing/Info frame is a valid MPEG frame containing metadata rather than
 * audio data. Industry standard is to exclude it from audio frame counts.
 *
 * Structure:
 * - Appears as first frame after ID3 tags
 * - Contains "Xing" (VBR) or "Info" (CBR) identifier at offset 36 (MPEG-1)
 */
async function skipXingInfoFrame(
  file: Awaited<ReturnType<typeof open>>,
  position: number,
  fileSize: number,
): Promise<number> {
  // Need at least 4 bytes for header + 36 bytes offset + 4 bytes for "Xing"/"Info"
  if (position + 44 > fileSize) return position;

  const header = await readUInt32BE(file, position);
  const frame = parseFrameHeader(header);

  if (!frame) return position;

  const frameLength =
    Math.floor(
      (FRAME_LENGTH_MULTIPLIER * 1000 * frame.bitrate) / frame.sampleRate,
    ) + frame.padding;

  if (frameLength <= 0 || position + frameLength > fileSize) return position;

  // Read potential Xing/Info identifier at offset 36 from frame start
  const identifierBuffer = Buffer.alloc(4);
  const { bytesRead } = await file.read(identifierBuffer, 0, 4, position + 36);

  if (bytesRead === 4) {
    const identifier = identifierBuffer.toString("ascii");
    if (identifier === "Xing" || identifier === "Info") {
      // Skip this metadata frame
      return position + frameLength;
    }
  }

  return position;
}

/**
 * Skip ID3v2 tag if present at start of file
 *
 * ID3v2 header layout (10 bytes total):
 *
 * Byte index:
 *  0–2  : ASCII "ID3" identifier
 *  3–4  : Version (major + revision)
 *  5    : Flags
 *  6–9  : Tag size (synchsafe 28-bit integer)
 */
export async function skipID3Tag(
  file: Awaited<ReturnType<typeof open>>,
  position: number,
  fileSize: number,
): Promise<number> {
  /**
   * We must read the full 10-byte ID3 header to decide anything.
   * If fewer than 10 bytes remain in the file, an ID3 tag cannot exist.
   */
  if (position + 10 > fileSize) return position;

  /**
   * Allocate a 10-byte buffer to hold the ID3v2 header.
   * Files are read in BYTES (not bits).
   */
  const buffer = Buffer.alloc(10);

  /**
   * Read exactly 10 bytes from the file at the current position.
   * These bytes correspond to the fixed-size ID3v2 header.
   */
  const { bytesRead } = await file.read(buffer, 0, 10, position);
  if (bytesRead < 10) return position;

  /**
   * Bytes 0–2 must be ASCII "ID3" for an ID3v2 tag.
   *
   * ASCII values:
   *  'I' = 0x49
   *  'D' = 0x44
   *  '3' = 0x33
   *
   * If these don’t match, this file does not start with an ID3 tag.
   */
  if (buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) {
    return position; // No ID3 tag present
  }

  /**
   * Bytes 6–9 store the ID3 tag size as a "synchsafe integer".
   *
   * Synchsafe means:
   * - Each byte uses only its lower 7 bits
   * - The highest bit is always 0
   * - Total size = 28 bits spread across 4 bytes
   *
   * Layout:
   *   buffer[6] → bits 27–21
   *   buffer[7] → bits 20–14
   *   buffer[8] → bits 13–7
   *   buffer[9] → bits 6–0
   *
   * & 0x7f     → keep only the lower 7 bits
   * << N       → move those bits into their final position
   * |          → combine all parts into one integer
   */
  const tagSize =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);

  /**
   * The full ID3 tag length is:
   *   10 bytes (header) + tagSize (payload)
   *
   * We skip past the entire tag so the next read starts
   * at the first MP3 frame header.
   */
  const nextPosition = position + 10 + tagSize;

  /**
   * Ensure we never return a position past EOF.
   */
  return nextPosition <= fileSize ? nextPosition : fileSize;
}
