import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../../config/jwt.js";
import type { Role } from "../security/rbac.js";

export function signAccessToken(subject: string, role: Role): { token: string; jti: string; expiresIn: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: subject, role, jti, typ: "access" }, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn as jwt.SignOptions["expiresIn"],
  });
  return { token, jti, expiresIn: jwtConfig.expiresIn };
}

export function signRefreshToken(subject: string, role: Role): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: subject, role, jti, typ: "refresh" }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
  return { token, jti };
}

export function verifyRefreshToken(token: string): { sub: string; role: Role; jti?: string } {
  const payload = jwt.verify(token, jwtConfig.refreshSecret) as {
    sub: string;
    role: Role;
    jti?: string;
    typ?: string;
  };
  if (!payload.sub || payload.typ !== "refresh") {
    throw new Error("Invalid refresh token");
  }
  return { sub: payload.sub, role: payload.role, jti: payload.jti };
}
