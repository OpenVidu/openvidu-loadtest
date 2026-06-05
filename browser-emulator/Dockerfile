FROM node:24-trixie AS build

WORKDIR /app

RUN corepack enable && corepack use pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json eslint.config.js ./
COPY src ./src

RUN pnpm run build

RUN pnpm prune --prod

FROM node:24-trixie-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y procps curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV SERVER_PORT=5000
ENV WEBSOCKET_PORT=5001

COPY package.json ./package.json

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

COPY public ./public
COPY public-lk ./public-lk
COPY index-mappings.json ./index-mappings.json

RUN mkdir -p recordings/chrome recordings/qoe stats logs mediafiles

EXPOSE 5000 5001

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
    CMD sh -c 'curl -f -k --max-time 4 -X GET https://localhost:5000/instance/ping || curl -f --max-time 4 -X GET http://localhost:5000/instance/ping || exit 1'

CMD ["node", "dist/server.js"]
