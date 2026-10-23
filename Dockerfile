# Latest Node 22 Alpine. Newer releases are picked up on pull.
# Builds fail if for node version < 22.23.4
FROM node:22-alpine AS node-base
RUN node <<'EOF'
const required = [22, 23, 4];
const current = process.versions.node.split('.').map(Number);

for (let i = 0; i < required.length; i++) {
  const part = current[i] ?? 0;
  if (part > required[i]) break;
  if (part < required[i]) {
    console.error(`Node ${process.versions.node} is older than ${required.join('.')}`);
    process.exit(1);
  }
}
EOF

# Install dependencies only when needed
FROM node-base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node-base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY docker/middleware.ts ./src

ARG DATABASE_TYPE
ARG BASE_PATH

ENV DATABASE_TYPE=$DATABASE_TYPE
ENV BASE_PATH=$BASE_PATH

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build-docker

# Production image, copy all the files and run next
FROM node-base AS runner
WORKDIR /app

ARG NODE_OPTIONS

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=$NODE_OPTIONS

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN npm install -g pnpm

RUN set -x \
    && apk add --no-cache curl

# Script dependencies
RUN pnpm add npm-run-all dotenv prisma@6.7.0

# Permissions for prisma
RUN chown -R nextjs:nodejs node_modules/.pnpm/

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["pnpm", "start-docker"]
