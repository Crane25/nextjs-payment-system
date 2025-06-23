# ===================================
# Multi-stage Dockerfile for Next.js
# Production-ready with security optimizations
# ===================================

# Stage 1: Dependencies
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY Frontend/package*.json ./
RUN npm ci --no-audit --no-fund

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies and application code
COPY --from=deps /app/node_modules ./node_modules
COPY Frontend/ ./

# Build application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Runner (Production)
FROM node:18-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install security updates and required tools
RUN apk update && apk upgrade && apk add --no-cache dumb-init wget curl

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create logs directory
RUN mkdir -p /app/logs && chown nextjs:nodejs /app/logs

# Environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Remove unnecessary packages and files
RUN apk del --purge $(apk info --installed | grep -v '^musl\|^busybox\|^alpine-baselayout\|^alpine-keys\|^ca-certificates\|^libc6-compat\|^libssl\|^libcrypto\|^zlib\|^nodejs\|^dumb-init' | xargs)

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Start application with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]