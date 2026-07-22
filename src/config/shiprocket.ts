import { env } from "./env.js";

export const shiprocketConfig = {
  email: env.SHIPROCKET_EMAIL ?? "",
  password: env.SHIPROCKET_PASSWORD ?? "",
  baseUrl: (env.SHIPROCKET_BASE_URL ?? "https://apiv2.shiprocket.in").replace(/\/$/, ""),
} as const;

export function isShiprocketConfigured(): boolean {
  return Boolean(shiprocketConfig.email && shiprocketConfig.password);
}
