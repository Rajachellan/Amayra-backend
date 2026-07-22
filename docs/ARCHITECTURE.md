# Amayra API — Architecture

## Overview

Enterprise feature-based layout for the Mairii / Amayra commerce API.

**Stack:** Node.js · Express · TypeScript · MongoDB/Mongoose · Cloudflare R2 · Razorpay · Shiprocket

## Design principles

1. **API contracts are frozen** for current storefront and admin clients.  
   Responses stay in their existing shapes (including `{ message }` on errors).  
   Envelope helpers live under `common/responses` for *new* versioned APIs only.
2. **Feature modules** own models, controllers, and (progressively) services/repositories.
3. **Integrations** isolate third-party SDKs from domain logic.
4. **Config** is typed and centralized — no scattered `process.env` in new code.

## Folder map

```
src/
  app/                 # Application factory + route registration
  config/              # Typed env, DB, JWT, CORS, R2, Razorpay, Shiprocket, logger
  common/              # Errors, middleware, responses, pagination
  modules/             # Domain features (customer, product, order, …)
  integrations/        # razorpay, shiprocket, cloudflare
  database/            # Reserved for migrations / shared DB helpers
  events/ queues/ jobs/# Reserved for domain events & async work
  routes/              # Legacy aggregator (same paths as production)
  models/ controllers/ services/  # Thin re-export shims (compatibility)
  utils/               # Shared helpers still used across modules
  docs/ scripts/ tests/
```

## Request flow

```
HTTP → middleware (helmet, cors, rate-limit, sanitize, auth)
     → module controller
     → service (business rules)
     → repository (MongoDB)
     → errorHandler (legacy { message })
```

## Compatibility shims

During migration, `src/models/*`, `src/controllers/*`, and `src/services/*` re-export from `modules/` and `integrations/`.  
Routes continue to import shims so nothing breaks. Prefer importing from `modules/*` in new code.

## Security middleware

- Helmet
- Compression
- CORS (allow-list + mairiijewels.com)
- Rate limiting
- Mongo sanitization
- Request IDs + structured request logging

## Next increments (non-breaking)

1. Split remaining fat controllers into `service.ts` + `repository.ts` per module.
2. Attach Zod `validate()` middleware on every route.
3. Introduce domain events for payment → stock → shipment → email.
4. Optional API versioning (`/api/v2`) with `{ success, data, meta }` envelopes.
