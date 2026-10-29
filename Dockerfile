# Simple single-stage image: reliable (Prisma CLI is available at runtime for
# `migrate deploy`) rather than minimal.
FROM node:20-bookworm-slim

# Prisma's query engine needs OpenSSL; ca-certificates for HTTPS to TMX.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (cached layer). `postinstall` runs `prisma generate`,
# so the schema must be present before `npm ci`.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci || npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Apply migrations (needs DATABASE_URL + DIRECT_URL), then start the server.
CMD ["npm", "run", "start:prod"]
