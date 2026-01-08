# MP3 File Analysis API

A TypeScript API endpoint that accepts MP3 file uploads and returns the number of audio frames in the file. Built with Node.js and Hono framework.

This was tested with the sample MP3 file provided and also with the provided file from me. Reference numbers for tests were sourced from`mediainfo` and `ffprobe`. 

I wasn't able to find a file that lacked an ID3 tag to test that code path.

## Features
- **Frame Counting**: Parses MPEG-1 Layer III (MP3) files and counts audio frames
- **ID3 Tag Handling**: Skips ID3v2 metadata tags at the start of files
- **VBR Support**: Correctly excludes Xing/Info metadata frames from count
- **Streaming Upload**: Handles file uploads efficiently via streaming
- **Error Handling**: Graceful error handling with cleanup of temporary files

## Requirements
- Node.js 22.17.0
- npm (comes with Node.js)

## Installation
Install dependencies:

```bash
npm install
```

## Running the Application
### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

## API Specification
### POST /file-upload
Accepts an MP3 file upload and returns the number of frames.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: MP3 file as form data with field name `file`

**Response:**
```json
{
  "frameCount": 6089
}
```

**Error Response:**
```json
{
  "error": "Error message describing what went wrong"
}
```

## Testing the API
### Using curl
```bash
curl -X POST -F "file=@path/to/your/file.mp3" http://localhost:3000/file-upload
```

Example with the sample file:
```bash
curl -X POST -F "file=@src/server-app/__fixtures__/sample.mp3" http://localhost:3000/file-upload
```

Expected output:
```json
{"frameCount":6089}
```

### Using the Test Suite

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Verification
You can verify the frame count using mediainfo:
```bash
# macOS (install via: brew install mediainfo)
mediainfo --fullscan path/to/file.mp3

# Look for the "Frame count" field in the output
```

## Project Structure
```
src/
├── server.ts                           # Server entry point
└── server-app/
    ├── index.ts                        # API routes
    ├── index.test.ts                   # API integration tests
    ├── __fixtures__/                   # Test MP3 files
    │   └── sample.mp3
    └── utils/
        ├── upload.ts                   # File upload streaming logic
        └── mp3/
            ├── constants.ts            # MP3 parsing constants
            ├── count-frames.ts         # Frame counting implementation
            └── count-frames.test.ts    # Unit tests
```

## Implementation Details
### Frame Counting Algorithm
1. **Skip ID3v2 tags**: Detects and skips ID3v2 metadata at file start
2. **Skip Xing/Info frame**: Excludes VBR header frame (metadata, not audio)
3. **Parse frame headers**: Reads 4-byte MPEG frame headers
4. **Validate frames**: Checks sync pattern, MPEG version, layer, bitrate, sample rate
5. **Calculate frame length**: Uses formula: `floor((144 * bitrate) / sampleRate) + padding`
6. **Iterate**: Jumps to next frame and repeats until end of file

### A note on comments
`count-frames.ts` contains significant inline comments explaining bit manipulation and MP3 structure. This is very unfamiliar territory for me and complex, so I wanted to document it to help myself. If this were a production codebase, I would likely move many of these comments to separate documentation files to improve readability.

### Xing/Info Frame Handling
The first audio frame in many MP3 files is a Xing (VBR) or Info (CBR) metadata frame containing file statistics. Following industry standards (LAME encoder, mediainfo, ffprobe), this metadata frame is excluded from the audio frame count to ensure accurate duration calculations.

## Code Quality
- **TypeScript**: Full type safety with strict mode enabled
- **Linting**: ESLint configuration included
- **Testing**: Comprehensive unit and integration tests with Vitest
- **Error Handling**: Proper cleanup of temporary files even on errors
- **Documentation**: Extensive inline comments explaining bit manipulation and MP3 structure

## Development
### Linting
```bash
npm run lint
```

### Building
```bash
npm run build
```
