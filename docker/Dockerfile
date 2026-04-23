FROM node:22-slim AS build

WORKDIR /repo
COPY package.json package-lock.json ./
COPY mcs/package.json ./mcs/package.json
RUN npm ci

COPY mcs ./mcs
RUN npm --prefix ./mcs run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# SvelteKit adapter-node output
COPY --from=build /repo/mcs/build ./build

EXPOSE 3000
CMD ["node", "build"]

