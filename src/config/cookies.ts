import type { CookieOptions } from "express";
import { env, isProduction } from "./env.js";

export function secureCookieOptions(maxAgeMs: number): CookieOptions {
  const secure = env.COOKIE_SECURE ?? isProduction;
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: maxAgeMs,
    path: "/",
  };
}

export const ACCESS_COOKIE = "mairii_access_token";
export const REFRESH_COOKIE = "mairii_refresh_token";
