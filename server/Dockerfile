# Authoritative game server image (Phase 3).
# The server is a separate process from the Vite frontend and is the only place
# that holds the Supabase service-role key.

FROM node:22-slim AS build
WORKDIR /app

# Server dependencies are declared in server/package.json, independent of the
# frontend's package.json so the client bundle never pulls in server code.
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/ ./server/
COPY shared/ ./shared/

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged.
USER node

COPY --from=build --chown=node:node /app ./

EXPOSE 8443
CMD ["node", "--experimental-strip-types", "server/index.ts"]
