import { AppError } from "../../utils/AppError.js";

const BASE = process.env.SHIPROCKET_BASE_URL?.replace(/\/$/, "") ?? "https://apiv2.shiprocket.in";

let cachedToken: string | null = null;
let cachedUntil = 0;

function tokenTtlMs() {
  // Docs: validity up to ~10 days; refresh early to avoid 401 bursts
  const fromEnv = Number(process.env.SHIPROCKET_TOKEN_TTL_SECONDS);
  const sec = Number.isFinite(fromEnv) && fromEnv > 300 ? fromEnv : 18 * 60 * 60;
  return sec * 1000;
}

/** Clear cached token (e.g. after 401). */
export function invalidateShiprocketToken() {
  cachedToken = null;
  cachedUntil = 0;
}

export function getShiprocketBaseUrl(): string {
  return BASE;
}

export async function getShiprocketBearerToken(forceRefresh = false): Promise<string> {
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || password === undefined || password === "") {
    throw new AppError(
      500,
      "Shiprocket credentials missing (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)"
    );
  }

  const now = Date.now();
  if (!forceRefresh && cachedToken && now < cachedUntil) {
    return cachedToken;
  }

  const res = await fetch(`${BASE}/v1/external/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : typeof data.errors === "string"
          ? data.errors
          : `Shiprocket login failed (${res.status})`;
    throw new AppError(res.status >= 400 && res.status < 500 ? res.status : 502, msg);
  }

  const token = typeof data.token === "string" ? data.token : null;
  if (!token) {
    throw new AppError(502, "Shiprocket login response missing token");
  }

  cachedToken = token;
  cachedUntil = now + tokenTtlMs();
  return token;
}
