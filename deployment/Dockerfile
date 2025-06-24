# ====================================================================
# Multi-Stage Production Dockerfile for Next.js
# Optimized for Security, Performance & Size
# ====================================================================

# Stage 1: Dependencies Installation
FROM node:18.20.4-alpine AS dependencies
LABEL stage=dependencies

# Install system dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY Frontend/package*.json ./
COPY Frontend/yarn.lock* ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci \
    --no-audit \
    --no-fund \
    --prefer-offline \
    --progress=false \
    && npm cache clean --force

# Stage 2: Build Application
FROM node:18.20.4-alpine AS builder
LABEL stage=builder

# Install build dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code
COPY Frontend/ ./

# Set build environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV GENERATE_SOURCEMAP=false

# Build application
RUN npm run build

# Verify build output
RUN ls -la .next/

# Stage 3: Production Runtime
FROM node:18.20.4-alpine AS production
LABEL stage=production
LABEL maintainer="Next.js Payment System"
LABEL version="2.0.0"

# Install runtime dependencies and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    wget \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Set timezone
ENV TZ=Asia/Bangkok
RUN cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime

# Create application user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Set working directory
WORKDIR /app

# Create necessary directories with proper ownership
RUN mkdir -p \
    /app/logs \
    /app/data \
    /app/.next/cache \
    && chown -R nextjs:nodejs /app

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Create optimized start script
RUN echo '#!/bin/sh\n\
set -e\n\
\n\
echo "🚀 Starting Next.js Payment System v2.0..."\n\
echo "📅 Started at: $(date)"\n\
echo "🌍 Environment: $NODE_ENV"\n\
echo "🔧 Node Version: $(node --version)"\n\
\n\
# Health check endpoint\n\
echo "🏥 Health check: http://localhost:$PORT/api/health"\n\
\n\
# Start application\n\
exec node server.js' > /app/start.sh

RUN chmod +x /app/start.sh && \
    chown nextjs:nodejs /app/start.sh

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: Remove package managers and unnecessary tools
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /opt/yarn* \
    /tmp/* \
    /var/tmp/*

# Switch to non-root user
USER nextjs

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --timeout=10 \
        http://localhost:$PORT/api/health || exit 1

# Expose application port
EXPOSE 3000

# Signal handling and process management
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["/app/start.sh"]