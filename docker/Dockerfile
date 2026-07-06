# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and compile TypeScript ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install dependencies first so this layer is cached unless the manifests change.
COPY package.json package-lock.json ./
RUN npm ci

# Compile the TypeScript sources to ./build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production dependencies + compiled output only ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only the production dependencies end up in the final image (no TypeScript,
# no dev tooling, smaller surface area).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

# Drop root privileges; the `node` user ships with the base image.
USER node

CMD ["node", "build/bot.js"]
