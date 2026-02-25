# Base Image
FROM oven/bun AS base
WORKDIR /usr/src/app

# Install Dependencies
FROM base AS install
RUN mkdir -p /temp/build
COPY package.json bun.lock /temp/build/
RUN cd /temp/build && bun install --frozen-lockfile

# Import Dependencies & Code
FROM base AS release
COPY --from=install /temp/build/node_modules node_modules
COPY . .

# Copy Dependencies & Code into final image
COPY --from=release /usr/src/app/index.ts .
COPY --from=release /usr/src/app/package.json .

# Start Hydrabase
USER bun
EXPOSE 4545/tcp
EXPOSE 45454/udp
CMD git pull; bun install; bun src
