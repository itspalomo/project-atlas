FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/atlas-api/package.json apps/atlas-api/package.json

RUN npm install --workspace @project-atlas/atlas-api

COPY apps/atlas-api apps/atlas-api
COPY ecosystem ecosystem
COPY infrastructure/postgres/migrations infrastructure/postgres/migrations

WORKDIR /app/apps/atlas-api
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/atlas-api/package.json apps/atlas-api/package.json
RUN npm install --omit=dev --workspace @project-atlas/atlas-api

COPY --from=build /app/apps/atlas-api/dist apps/atlas-api/dist
COPY ecosystem ecosystem
COPY infrastructure/postgres/migrations infrastructure/postgres/migrations

WORKDIR /app/apps/atlas-api
USER node
CMD ["node", "dist/index.js"]
