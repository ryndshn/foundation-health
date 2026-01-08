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
import {
  BITRATES,
  FRAME_LENGTH_MULTIPLIER,
  FRAME_SYNC,
  ID3_HEADER_SIZE,
  ID3_TAG_IDENTIFIER,
  LAYER_III,
  SAMPLE_RATES,
  SYNCHSAFE_MASK,
  UINT32_SIZE,
  VERSION_MPEG_1,
} from "./constants";

export async function countFrames(filePath: string): Promise<number> {
  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();
    if (size < UINT32_SIZE) return 0;

    let position = 0;

    // Skip ID3v2 tag if present
    position = await skipID3Tag(file, position, size);

    // Skip Xing/Info VBR header frame if present
    // (industry standard: exclude metadata frames from audio frame count)
    position = await skipXingInfoFrame(file, position, size);

    // Count frames
    let frameCount = 0;

    while (position + UINT32_SIZE <= size) {
      const header = await readUInt32BE(file, position);
      const frame = parseFrameHeader(header);

      if (!frame) {
        throw new Error(`Invalid MP3 frame header at position ${position}`);
      }

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
 *  Extract specific bits from a 32-bit header
 *   Starting bit position counting from the right
 */
const getBitsFromHeader = (header: number, start: number, len: number) => {
  const end = start - len + 1;

  const shifted = header >>> end;

  // Create a mask of the appropriate length
  const mask = (1 << len) - 1;
  return shifted & mask;
};

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
   */
  const sync = getBitsFromHeader(header, 31, 11);
  if (sync !== FRAME_SYNC) return null;

  /**
   * MPEG Audio version ID (bits 20–19, 2 bits)
   */
  const version = getBitsFromHeader(header, 20, 2);
  if (version !== VERSION_MPEG_1) return null;

  /**
   * Layer description (bits 18–17, 2 bits)
   */
  const layer = getBitsFromHeader(header, 18, 2);
  if (layer !== LAYER_III) return null;

  /**
   * Bitrate index (bits 15–12, 4 bits)
   */
  const bitrateIndex = getBitsFromHeader(header, 15, 4);

  /**
   * Sample rate index (bits 11–10, 2 bits)
   */
  const sampleRateIndex = getBitsFromHeader(header, 11, 2);

  // Lookup actual values from tables
  const bitrate = BITRATES[bitrateIndex];
  const sampleRate = SAMPLE_RATES[sampleRateIndex];

  if (!bitrate || !sampleRate) return null;

  /**
   * Padding flag (bit 9, 1 bit)
   * - 1 means frame includes an extra padding byte
   */
  const padding = getBitsFromHeader(header, 9, 1);

  return { bitrate, sampleRate, padding };
}

/**
 * Read a 32-bit unsigned integer (big-endian) from file
 */
export async function readUInt32BE(
  file: Awaited<ReturnType<typeof open>>,
  position: number,
): Promise<number> {
  const buffer = Buffer.alloc(UINT32_SIZE);
  const { bytesRead } = await file.read(buffer, 0, UINT32_SIZE, position);
  return bytesRead === UINT32_SIZE ? buffer.readUInt32BE(0) : 0;
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

  if (!frame) {
    throw new Error(
      "Invalid MP3 frame header while checking for Xing/Info frame",
    );
  }

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
  if (position + ID3_HEADER_SIZE > fileSize) return position;

  /**
   * Allocate a 10-byte buffer to hold the ID3v2 header.
   * Files are read in BYTES (not bits).
   */
  const buffer = Buffer.alloc(ID3_HEADER_SIZE);

  /**
   * Read exactly 10 bytes from the file at the current position.
   * These bytes correspond to the fixed-size ID3v2 header.
   */
  const { bytesRead } = await file.read(buffer, 0, ID3_HEADER_SIZE, position);
  if (bytesRead < ID3_HEADER_SIZE) return position;

  /**
   * Bytes 0–2 must be ASCII "ID3" for an ID3v2 tag.
   */
  for (let i = 0; i < ID3_TAG_IDENTIFIER.length; i++) {
    if (buffer[i] !== ID3_TAG_IDENTIFIER.charCodeAt(i)) {
      return position; // No ID3 tag present
    }
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
   * Example:
   *   buffer[6] = 10000001
   *   buffer[7] = 10001111
   *   buffer[8] = 10011001
   *   buffer[9] = 11110000
   *   tagSize = 0000001 0001111 0011001 1110000
   */

  let tagSize = 0;
  for (let i = 6; i < ID3_HEADER_SIZE; i++) {
    const masked = buffer[i] & SYNCHSAFE_MASK;
    tagSize = (tagSize << 7) | masked;
  }

  /**
   * The full ID3 tag length is:
   *   10 bytes (header) + tagSize (payload)
   *
   * We skip past the entire tag so the next read starts
   * at the first MP3 frame header.
   */
  const nextPosition = position + ID3_HEADER_SIZE + tagSize;

  /**
   * Ensure we never return a position past EOF.
   */
  return Math.min(nextPosition, fileSize);
}
