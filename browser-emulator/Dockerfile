FROM node:24-trixie AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json eslint.config.js ./
COPY src ./src

RUN pnpm run build

FROM node:24-trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=5000
ENV COM_MODULE=openvidu

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/assets ./src/assets

COPY public ./public
COPY public-lk ./public-lk
COPY package.json ./package.json
COPY index-mappings.json ./index-mappings.json

RUN mkdir -p recordings/chrome recordings/qoe stats logs mediafiles

EXPOSE 5000

CMD ["node", "dist/server.js"]
