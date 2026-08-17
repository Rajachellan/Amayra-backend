import { env } from "./env.js";

function inferAccountIdFromPublicUrl(): string | undefined {
  const base = env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return undefined;
  try {
    const host = new URL(base).hostname.toLowerCase();
    const match = host.match(/^pub-([a-f0-9]{32})\.r2\.dev$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function resolveS3Endpoint(): string {
  const explicit = env.R2_S3_ENDPOINT?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const accountId =
    env.R2_ACCOUNT_ID?.trim() ||
    env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    env.CF_ACCOUNT_ID?.trim() ||
    inferAccountIdFromPublicUrl();
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  return "";
}

export const cloudflareConfig = {
  uploadStorage: env.UPLOAD_STORAGE?.trim().toLowerCase() ?? "",
  r2: {
    publicBaseUrl: env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "",
    bucketName: env.R2_BUCKET_NAME ?? "",
    accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
    s3Endpoint: resolveS3Endpoint(),
  },
  images: {
    accountId: env.CF_IMAGES_ACCOUNT_ID ?? "",
    apiToken: env.CF_IMAGES_API_TOKEN ?? "",
  },
} as const;

export function isR2Configured(): boolean {
  const { r2 } = cloudflareConfig;
  return Boolean(
    r2.s3Endpoint && r2.accessKeyId && r2.secretAccessKey && r2.bucketName && r2.publicBaseUrl
  );
}
