import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default("0.0.0.0"),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    JWT_SECRET: z.string().min(8, "JWT_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(8).optional(),
    JWT_EXPIRES_IN: z.string().default("30d"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(12).max(15).default(12),
    CORS_ORIGIN: z.string().default(""),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    UPLOAD_STORAGE: z.string().optional(),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
    R2_PUBLIC_BASE_URL: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_S3_ENDPOINT: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CF_ACCOUNT_ID: z.string().optional(),
    CF_IMAGES_ACCOUNT_ID: z.string().optional(),
    CF_IMAGES_API_TOKEN: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    SHIPROCKET_BASE_URL: z.string().default("https://apiv2.shiprocket.in"),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal", "trace"]).default("info"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    if (!data.CORS_ORIGIN.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "CORS_ORIGIN must list allowed frontend origins in production",
        path: ["CORS_ORIGIN"],
      });
    }
    if (!data.RAZORPAY_KEY_ID || !data.RAZORPAY_KEY_SECRET) {
      ctx.addIssue({
        code: "custom",
        message: "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET required in production",
        path: ["RAZORPAY_KEY_ID"],
      });
    }
    if (data.JWT_SECRET === "change-me-in-production" || data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        message: "Replace JWT_SECRET with a strong secret (32+ chars) in production",
        path: ["JWT_SECRET"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n - ");
  console.error(`Invalid environment configuration:\n - ${details}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET ?? `${parsed.data.JWT_SECRET}_refresh`,
};

export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
