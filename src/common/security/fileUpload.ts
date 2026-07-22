import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../errors/AppError.js";
import { env } from "../../config/env.js";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

const DANGEROUS_EXT = /\.(exe|sh|bat|cmd|ps1|js|mjs|cjs|php|py|rb|jar|dll|so|html|htm|svg|xml)$/i;

export async function assertSafeImageUpload(
  buffer: Buffer,
  originalname: string,
  declaredMime: string
): Promise<{ mime: string; ext: string }> {
  if (!buffer?.length) throw new AppError(400, "Empty upload");
  if (buffer.length > env.UPLOAD_MAX_BYTES) {
    throw new AppError(400, `File too large (max ${Math.floor(env.UPLOAD_MAX_BYTES / (1024 * 1024))}MB)`);
  }
  if (DANGEROUS_EXT.test(originalname)) {
    throw new AppError(400, "File type not allowed");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime) || !ALLOWED_EXT.has(detected.ext)) {
    throw new AppError(400, "Only image uploads are allowed (jpeg, png, webp, gif, avif)");
  }

  // Declared MIME should match sniff when provided
  if (declaredMime && declaredMime !== "application/octet-stream" && !ALLOWED_MIME.has(declaredMime)) {
    throw new AppError(400, "Invalid content type");
  }

  return { mime: detected.mime, ext: detected.ext };
}
