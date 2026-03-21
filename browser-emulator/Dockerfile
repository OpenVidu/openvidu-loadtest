FROM node:24-trixie AS build

WORKDIR /app

RUN corepack enable && corepack use pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json eslint.config.js ./
COPY src ./src

RUN pnpm run build

FROM node:24-trixie-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y procps xvfb x11vnc ffmpeg && rm -rf /var/lib/apt/lists/*

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

CMD ["node", "dist/server.js"]
