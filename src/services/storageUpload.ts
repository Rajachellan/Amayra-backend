import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function extFromOriginal(name: string): string {
  const m = name.match(/(\.[a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : ".bin";
}

const R2_FOLDERS = new Set(["products", "categories", "banners", "blogs", "promotional", "misc"]);

function objectKey(originalname: string, folder: string): string {
  const safe = originalname.replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
  const prefix = R2_FOLDERS.has(folder) ? folder : "misc";
  return `${prefix}/${Date.now()}-${randomBytes(6).toString("hex")}${extFromOriginal(originalname)}`;
}

function inferAccountIdFromR2PublicUrl(): string | undefined {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return undefined;
  try {
    const host = new URL(base).hostname.toLowerCase();
    const m = host.match(/^pub-([a-f0-9]{32})\.r2\.dev$/);
    if (m) return m[1];
  } catch {
    return undefined;
  }
  return undefined;
}

function r2S3Endpoint(): string {
  const explicit = process.env.R2_S3_ENDPOINT?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const accountId =
    process.env.R2_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    process.env.CF_ACCOUNT_ID?.trim() ||
    inferAccountIdFromR2PublicUrl();
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  return "";
}

function isR2Configured(): boolean {
  return Boolean(
    r2S3Endpoint() &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

function isCfImagesConfigured(): boolean {
  return Boolean(process.env.CF_IMAGES_ACCOUNT_ID && process.env.CF_IMAGES_API_TOKEN);
}

function resolveDriver(): "r2" | "cf_images" | "local" {
  const raw = process.env.UPLOAD_STORAGE?.trim().toLowerCase();
  if (raw === "local") return "local";
  if (raw === "r2") return "r2";
  if (raw === "cloudflare_images" || raw === "cf_images") return "cf_images";
  if (isR2Configured()) return "r2";
  if (isCfImagesConfigured()) return "cf_images";
  return "local";
}

async function uploadToR2(
  buffer: Buffer,
  originalname: string,
  contentType: string,
  folder: string
): Promise<{ url: string; key: string }> {
  const endpoint = r2S3Endpoint();
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicBase = process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, "");
  const key = objectKey(originalname, folder);

  const put = async (ep: string) => {
    const client = new S3Client({
      region: "auto",
      endpoint: ep,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );
  };

  try {
    await put(endpoint);
  } catch (e) {
    // If user didn't set an explicit endpoint, retry against jurisdictional endpoints.
    // This commonly fixes TLS handshake failures for EU / FedRAMP accounts.
    const explicit = process.env.R2_S3_ENDPOINT?.trim();
    const accountId =
      process.env.R2_ACCOUNT_ID?.trim() ||
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
      process.env.CF_ACCOUNT_ID?.trim();
    const msg = e instanceof Error ? e.message : String(e);
    const looksLikeTls = /EPROTO|handshake failure|ssl3_read_bytes/i.test(msg);
    if (!explicit && accountId && looksLikeTls) {
      await put(`https://${accountId}.eu.r2.cloudflarestorage.com`);
    } else {
      throw e;
    }
  }

  return { url: `${publicBase}/${key}`, key };
}

async function uploadToCloudflareImages(
  buffer: Buffer,
  originalname: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const accountId = process.env.CF_IMAGES_ACCOUNT_ID!;
  const token = process.env.CF_IMAGES_API_TOKEN!;
  const form = new FormData();
  const body = new Uint8Array(buffer.byteLength);
  body.set(buffer);
  form.append(
    "file",
    new Blob([body], { type: contentType || "application/octet-stream" }),
    originalname || "image.jpg"
  );

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = (await r.json()) as {
    success?: boolean;
    errors?: { message: string }[];
    result?: { variants?: string[] };
  };

  if (!r.ok || !data.success) {
    const msg =
      data.errors?.map((e) => e.message).join("; ") || (await r.text()) || "Cloudflare Images upload failed";
    throw new Error(msg);
  }

  const variants = data.result?.variants;
  if (!variants?.length) throw new Error("Cloudflare Images: no variants in response");
  const preferred =
    variants.find((v) => v.includes("/public")) ?? variants[variants.length - 1] ?? variants[0];
  const key = preferred.split("/").slice(-2, -1)[0] || preferred;
  return { url: preferred, key };
}

async function saveLocal(buffer: Buffer, originalname: string, folder: string): Promise<{ url: string; key: string }> {
  const prefix = R2_FOLDERS.has(folder) ? folder : "misc";
  const uploadDir = path.join(process.cwd(), "uploads", prefix);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(4).toString("hex")}${extFromOriginal(originalname)}`;
  const key = `${prefix}/${filename}`;
  await fs.promises.writeFile(path.join(uploadDir, filename), buffer);
  return { url: `/uploads/${key}`, key };
}

export type UploadFolder = "products" | "categories" | "banners" | "blogs" | "promotional" | "misc";

export type UploadResult = { url: string; key: string };

/** Persists an uploaded image and returns public URL + storage key. */
export async function storeUploadedFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  options?: { folder?: UploadFolder }
): Promise<UploadResult> {
  const folder = options?.folder && R2_FOLDERS.has(options.folder) ? options.folder : "misc";
  const driver = resolveDriver();
  if (driver === "r2") {
    if (!isR2Configured()) {
      throw new Error(
        "R2 is not fully configured. Set R2_PUBLIC_BASE_URL, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and either R2_S3_ENDPOINT, R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), or use a default public URL like https://pub-<account_id>.r2.dev so the account id can be inferred. See backend .env.example."
      );
    }
    return uploadToR2(buffer, originalname, mimetype, folder);
  }
  if (driver === "cf_images") {
    if (!isCfImagesConfigured()) throw new Error("Cloudflare Images env vars incomplete");
    return uploadToCloudflareImages(buffer, originalname, mimetype);
  }
  return saveLocal(buffer, originalname, folder);
}
