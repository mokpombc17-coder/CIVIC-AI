ARG NODE_RUNTIME_IMAGE=node:24.18.0-bookworm-slim
FROM ${NODE_RUNTIME_IMAGE}

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --chown=node:node . ./

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
