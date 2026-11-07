FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN SESSION_SECRET=build-only npm run build

ENV NODE_ENV=production
RUN mkdir -p /data/vault && chown -R node:node /app /data/vault
USER node
EXPOSE 3000
# db push creates/updates tables, seed adds role templates (idempotent), then start the app
CMD ["sh", "-c", "npx prisma db push --skip-generate && node prisma/seed.mjs && npm start"]
