# syntax=docker/dockerfile:1.7
FROM node:24.18.0-alpine AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/bridge/package.json packages/bridge/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm --filter @app/web build

FROM dependencies AS verification
COPY . .
RUN pnpm run check

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 civic && adduser -S -u 10001 -G civic civic
WORKDIR /app
COPY --from=build --chown=civic:civic /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=civic:civic /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=civic:civic /workspace/apps/web/public ./apps/web/public
USER 10001:10001
EXPOSE 3000
ENTRYPOINT ["node", "apps/web/server.js"]
