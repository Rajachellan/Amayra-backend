# Security Hardening Report — Amayra / Mairii API

**Date:** 2026-07-21  
**Scope:** Existing Express + TypeScript backend  
**Constraint:** No API contract / frontend breakage

---

## 1. Installed packages

### Production
| Package | Purpose |
|---------|---------|
| `helmet` | Security headers (CSP, HSTS, frameguard, nosniff, …) |
| `cors` | Strict allow-list origins + credentials |
| `compression` | Response compression |
| `express-rate-limit` | Global + route-specific rate limits |
| `express-slow-down` | Progressive delay on auth/OTP |
| `hpp` | HTTP Parameter Pollution protection |
| `express-mongo-sanitize` | Blocks `$gt` / `$ne` / `$where` injection |
| `xss` | Deep string sanitization |
| `zod` | Env + request validation |
| `bcryptjs` | Password hashing (12 rounds) — bcrypt-compatible, Windows-safe |
| `jsonwebtoken` | Access + refresh tokens with `jti` |
| `cookie-parser` | Secure cookie support |
| `pino` / `pino-http` | Structured logging |
| `uuid` / `crypto.randomUUID` | Request IDs / token IDs |
| `file-type` | Magic-byte upload sniffing |
| `rotating-file-stream` | Available for log rotation extensions |

### Development
`typescript`, `eslint`, `prettier`, `husky`, `lint-staged`, `@types/*`, `pino-pretty`

> **Note:** Native `bcrypt` was not used (native compile issues on many Windows hosts). `bcryptjs` at **12 rounds** provides equivalent security for this stack.

---

## 2. Configured middleware (order)

1. `trust proxy` + hide `X-Powered-By`
2. Request ID (`x-request-id`)
3. Helmet (CSP/HSTS in production, frameguard deny, nosniff, referrer policy, CORP)
4. Permissions-Policy + strip `Server`
5. Compression
6. CORS (credentials, no wildcard in production)
7. Global rate limiter
8. Cookie parser
9. Razorpay raw webhook routes
10. JSON / urlencoded (1mb)
11. HPP
12. Mongo sanitize
13. XSS sanitize (body/query/params)
14. Access logger (Pino)
15. Routes (+ auth/payment/admin limiters)
16. Central error handler (no stack leakage)

---

## 3. Security improvements

| Area | Change |
|------|--------|
| Headers | Full Helmet + Permissions-Policy |
| Auth abuse | Admin / customer login rate limits + slow-down |
| Payments | Dedicated payment rate limiter |
| OTP | Limiter + slow-down wired (`/auth/otp/request` stub) |
| Injection | Mongo sanitize + HPP + Zod env validation |
| XSS | `xss` deep sanitize on inbound strings |
| Passwords | `BCRYPT_ROUNDS` default **12**; never logged |
| JWT | Access tokens with `jti` + typ; refresh tokens additive; blacklist support |
| Uploads | Magic-byte check, mime allow-list, size cap (`UPLOAD_MAX_BYTES`), reject executables |
| Errors | Generic client messages; detailed Pino logs only |
| Env | App **exits** on invalid env; production requires strong JWT + CORS + Razorpay |
| Logs | `logs/combined.log`, `error.log`, `security.log`, `access.log` + redaction |
| RBAC | `customer` / `admin` / `super_admin` permissions middleware |
| CORS | Unknown origins blocked in production |

---

## 4. API compatibility (preserved)

- Existing success payloads unchanged
- Errors still `{ message }`
- Bearer `Authorization` still primary auth
- Admin login adds optional `refreshToken` field (ignored by older clients)
- Upload response shape unchanged (`url`, `key`, `imageUrl`, `imageKey`)

---

## 5. npm audit

- Ran `npm audit fix`
- Remaining: **1 low** (`esbuild` via `tsx` / Windows advisory) — **dev-only**, not in production runtime image if you deploy `npm ci --omit=dev` + `node dist`

---

## 6. Remaining recommendations

1. Rotate `JWT_SECRET` to 32+ random bytes before production cutover  
2. Put refresh-token blacklist in **Redis** when scaling beyond one replica  
3. Add Zod `validate()` middleware to every remaining public/admin route (customer profile already Zod-validated)  
4. Enable Razorpay webhook signature verification with `RAZORPAY_WEBHOOK_SECRET`  
5. WAF / Cloudflare rate rules in front of Coolify  
6. Dependabot / weekly `npm audit` in CI  
7. Fix remaining `esbuild` advisory by upgrading `tsx` when patch lands  

---

## 7. Architecture changes (security-related)

```
src/config/env.ts          # hardened Zod env (fail-closed in production)
src/config/logger.ts       # Pino + file streams
src/config/cookies.ts      # httpOnly / secure / sameSite helpers
src/common/security/       # password, sanitize, fileUpload, rbac, tokenBlacklist
src/common/auth/tokens.ts  # access + refresh signing
src/common/middleware/     # rateLimiters, sanitizeInput, authenticate+blacklist
src/app/createApp.ts       # full security middleware stack
logs/                      # persisted logs (gitignored)
```

---

## 8. Potential vulnerabilities fixed

- Mongo operator injection via query/body  
- XSS stored/reflected via unsanitized strings  
- Brute-force login (rate limit + slow down)  
- Oversized / polyglot uploads  
- Missing security headers  
- Stack / DB error leakage  
- Overly permissive CORS when misconfigured in production  
- Weak password hashing rounds (10 → 12)  

---

## 9. Performance improvements

- Compression for responses > 1KB  
- Leaner JSON body limit (1mb)  
- Upload max default 8MB (was 25MB)  
- Structured logging without blocking console spam  
- Rate limits reduce abusive load  

---

## 10. Files modified / added (high level)

- `src/app/createApp.ts`
- `src/config/env.ts`, `logger.ts`, `cors.ts`, `jwt.ts`, `cookies.ts`
- `src/common/middleware/*`, `src/common/security/*`, `src/common/auth/tokens.ts`
- `src/routes/index.ts`
- `src/modules/auth/controller.ts`, `model.ts`
- `src/modules/customer/controller.ts`
- `src/utils/ensureAdmin.ts`, `src/seed/seed.ts`, `src/server.ts`
- `package.json`, `eslint.config.js`, `.prettierrc.json`, `.husky/pre-commit`
- `docs/SECURITY_REPORT.md`

---

## Verification

```bash
npm run typecheck   # pass
npm run build       # pass
node --import tsx -e "import { createApp } from './src/app/createApp.ts'"  # boots
```

Restart API: `npm run dev`
