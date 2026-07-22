# Amayra API — production image for Coolify / Docker
FROM node:22-alpine AS deps
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV HUSKY=0
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
RUN addgroup -S amayra && adduser -S amayra -G amayra
COPY package.json package-lock.json ./
COPY scripts/prepare.mjs ./scripts/prepare.mjs
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/logs /app/uploads && chown -R amayra:amayra /app
USER amayra
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
