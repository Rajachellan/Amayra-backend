# Amayra / Mairii API

Production Express + TypeScript backend for the Mairii jewellery platform.

## Quick start

```bash
npm install
cp .env.example .env   # if present — otherwise configure .env
npm run dev            # http://0.0.0.0:4000
```

```bash
npm run typecheck
npm run build
npm start
```

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/MODULES.md](./docs/MODULES.md).

High-level layout:

- `src/app` — HTTP app bootstrap
- `src/config` — typed configuration + logger
- `src/common` — errors, middleware, responses, pagination
- `src/modules` — feature modules
- `src/integrations` — Razorpay, Shiprocket, Cloudflare R2

Legacy folders (`models/`, `controllers/`, `services/`) are **compatibility shims** that re-export from the new locations so existing imports keep working.

## API compatibility

**Do not change response envelopes without a coordinated frontend release.**  
Current clients expect flat success payloads and `{ message }` on errors.

## Health

`GET /health` → `{ ok: true }`
