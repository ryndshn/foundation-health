import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

/**
 * Streams uploaded file to temp disk location.
 * Returns filepath for processing.
 */
export async function streamUploadToDisk(request: Request): Promise<string> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: { "content-type": request.headers.get("content-type") || "" },
    });

    busboy.on("file", (_name, file) => {
      const filepath = join(tmpdir(), `${randomUUID()}.mp3`);
      const writeStream = createWriteStream(filepath);

      file.pipe(writeStream);

      writeStream.on("finish", () => resolve(filepath));
      writeStream.on("error", reject);
    });

    busboy.on("error", reject);

    if (!request.body) {
      reject(new Error("No file uploaded"));
      return;
    }

    Readable.fromWeb(request.body).pipe(busboy);
  });
}
