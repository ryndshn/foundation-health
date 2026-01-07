/**
 * MP3 (MPEG-1 Layer III) parsing constants
 */

// Bitrate lookup table (MPEG-1 Layer III) in kbps
export const BITRATES = [
  0, // free format (not used)
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  0, // bad value
] as const;

// Sample rate lookup table (MPEG-1) in Hz
export const SAMPLE_RATES = [44100, 48000, 32000] as const;

// Frame length formula constant
// frameLength = floor(144 * bitrate / sampleRate) + padding
export const FRAME_LENGTH_MULTIPLIER = 144;
