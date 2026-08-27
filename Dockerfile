# ============================================================
# Paisa — Multi-stage Dockerfile for Production
# ============================================================
# Build:  docker build -t paisa-app .
# Run:    docker run -p 3000:3000 --env-file .env paisa-app
# ============================================================

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# Stage 2: Build the application
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built output and server runner
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prod-server.js ./prod-server.js
COPY --from=builder /app/package.json ./package.json

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 paisa && \
    chown -R paisa:nodejs /app

USER paisa

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "prod-server.js"]
