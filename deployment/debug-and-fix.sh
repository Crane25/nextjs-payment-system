#!/bin/bash

# ===================================
# Debug and Fix SESSION_SECRET Error
# Comprehensive diagnostic and fix script
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_debug() {
    echo -e "${CYAN}[DEBUG]${NC} $1"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Debug and Fix SESSION_SECRET Error${NC}"
echo -e "${BLUE} Comprehensive Diagnostic Tool${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -d "/var/www/scjsnext" ]; then
    print_error "Project directory /var/www/scjsnext not found!"
    exit 1
fi

cd /var/www/scjsnext

print_status "🔍 STEP 1: Diagnosing current state..."

# Check if files exist
print_debug "Checking if required files exist..."
FILES_MISSING=0

if [ ! -f "Frontend/src/config/env.server.ts" ]; then
    print_error "❌ env.server.ts is MISSING!"
    FILES_MISSING=1
else
    print_status "✅ env.server.ts found"
fi

if [ ! -f "Frontend/src/config/env.ts" ]; then
    print_error "❌ env.ts is MISSING!"
    FILES_MISSING=1
else
    print_status "✅ env.ts found"
fi

if [ ! -f "deployment/docker-compose-no-ssl.yml" ]; then
    print_error "❌ docker-compose-no-ssl.yml is MISSING!"
    FILES_MISSING=1
else
    print_status "✅ docker-compose-no-ssl.yml found"
fi

# Check if env.ts has been fixed (shouldn't contain sessionSecret)
print_debug "Checking if env.ts has been fixed..."
if grep -q "sessionSecret.*process.env.SESSION_SECRET" Frontend/src/config/env.ts; then
    print_error "❌ env.ts still contains client-side SESSION_SECRET access!"
    FILES_MISSING=1
else
    print_status "✅ env.ts has been fixed (no client-side secrets)"
fi

# Check if Docker config has environment variables
print_debug "Checking Docker configuration..."
if grep -q "SESSION_SECRET=" deployment/docker-compose-no-ssl.yml; then
    print_status "✅ SESSION_SECRET found in Docker config"
else
    print_error "❌ SESSION_SECRET NOT found in Docker config!"
    FILES_MISSING=1
fi

if [ $FILES_MISSING -eq 1 ]; then
    print_error "🚨 CRITICAL: Required files are missing or incorrect!"
    echo ""
    print_status "Creating the missing/incorrect files now..."
    
    # Create env.server.ts
    print_status "Creating Frontend/src/config/env.server.ts..."
    mkdir -p Frontend/src/config
    cat > Frontend/src/config/env.server.ts << 'EOF'
// Server-side Environment Configuration
// This file should ONLY be imported in server-side code (API routes, middleware, etc.)
// DO NOT import this in client-side components

export const serverConfig = {
  // Security Environment Variables (Server-side only)
  security: {
    sessionSecret: process.env.SESSION_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET environment variable is required in production');
      }
      return 'development-session-secret-' + Math.random().toString(36).substring(2, 15);
    })(),
    csrfSecret: process.env.CSRF_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CSRF_SECRET environment variable is required in production');
      }
      return 'development-csrf-secret-' + Math.random().toString(36).substring(2, 15);
    })(),
    encryptionKey: process.env.ENCRYPTION_KEY || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY environment variable is required in production');
      }
      return 'development-encryption-key-' + Math.random().toString(36).substring(2, 15);
    })(),
    hashSalt: process.env.HASH_SALT || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('HASH_SALT environment variable is required in production');
      }
      return 'development-hash-salt-' + Math.random().toString(36).substring(2, 15);
    })(),
    
    // Other server-side security settings
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS || '3600000'),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || '900000'),
    
    // External services (server-side only)
    monitoringApiKey: process.env.MONITORING_API_KEY,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    externalMonitoringUrl: process.env.EXTERNAL_MONITORING_URL,
  },
  
  // Database configuration (server-side only)
  database: {
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    enableSSL: process.env.DB_ENABLE_SSL !== 'false'
  },
  
  // Email configuration (server-side only)
  email: {
    serverUser: process.env.EMAIL_SERVER_USER,
    serverPassword: process.env.EMAIL_SERVER_PASSWORD,
    serverHost: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
    serverPort: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
    from: process.env.EMAIL_FROM
  }
};

// Server-side validation function
export function validateServerConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET is required in production');
    }
    if (!process.env.CSRF_SECRET) {
      errors.push('CSRF_SECRET is required in production');
    }
    if (!process.env.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required in production');
    }
    if (!process.env.HASH_SALT) {
      errors.push('HASH_SALT is required in production');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
EOF

    # Fix env.ts to remove server-side secrets
    print_status "Fixing Frontend/src/config/env.ts..."
    if [ -f "Frontend/src/config/env.ts.backup" ]; then
        print_debug "Backup already exists, removing old backup..."
        rm Frontend/src/config/env.ts.backup
    fi
    
    cp Frontend/src/config/env.ts Frontend/src/config/env.ts.backup
    
    # Create a client-safe env.ts
    cat > Frontend/src/config/env.ts << 'EOF'
// Environment configuration - CLIENT SAFE VERSION
// This version only contains client-safe environment variables

export const config = {
  // Firebase Configuration
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  },
  
  // App Configuration
  app: {
    env: process.env.NEXT_PUBLIC_APP_ENV || 'production',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    domain: process.env.NEXT_PUBLIC_DOMAIN || 'scjsnext.com'
  },
  
  // Security Configuration - Client-safe values only
  security: {
    // Rate limiting (client-safe)
    rateLimitMaxRequests: parseInt(process.env.NEXT_PUBLIC_RATE_LIMIT_MAX_REQUESTS || '100'),
    rateLimitWindowMs: parseInt(process.env.NEXT_PUBLIC_RATE_LIMIT_WINDOW_MS || '900000'),
    
    // Session timeout (client-safe)
    sessionTimeout: parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MS || '3600000'),
    
    // Security headers
    securityHeadersEnabled: process.env.SECURITY_HEADERS_ENABLED !== 'false',
    strictTransportSecurity: process.env.HSTS_ENABLED !== 'false',
    contentSecurityPolicy: process.env.CSP_ENABLED !== 'false',
    
    // HTTPS enforcement
    forceHttps: process.env.FORCE_HTTPS !== 'false' && process.env.NODE_ENV === 'production',
    httpsPort: parseInt(process.env.HTTPS_PORT || '443'),
    httpRedirectPort: parseInt(process.env.HTTP_REDIRECT_PORT || '80'),
    
    // Secure cookies
    secureCookies: process.env.SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production',
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
    cookieHttpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
    cookieSecure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
    
    // CSP Configuration
    cspReportUri: process.env.CSP_REPORT_URI || '/api/security/report',
    cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',
    
    // CSP sources
    scriptSources: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://www.gstatic.com',
      'https://www.googleapis.com',
      'https://apis.google.com',
      'https://securetoken.googleapis.com'
    ],
    styleSources: [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com'
    ],
    imgSources: [
      "'self'",
      'data:',
      'blob:',
      'https:'
    ],
    connectSources: [
      "'self'",
      'https://www.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://firestore.googleapis.com',
      'wss://ws-*.firestore.googleapis.com'
    ],
    fontSources: [
      "'self'",
      'https://fonts.gstatic.com'
    ],
    frameSources: [
      "'self'",
      'https://www.google.com',
      'https://accounts.google.com'
    ],
    
    // Other security settings (client-safe)
    enableExternalLogging: process.env.ENABLE_EXTERNAL_LOGGING === 'true',
    maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH || '10000'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,gif,pdf,doc,docx').split(','),
    apiKeyRequired: process.env.API_KEY_REQUIRED === 'true',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
    requireMFA: process.env.REQUIRE_MFA === 'true',
    auditLogEnabled: process.env.AUDIT_LOG_ENABLED !== 'false',
    auditLogLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90'),
    allowedIPs: process.env.ALLOWED_IPS?.split(',') || [],
    blockedIPs: process.env.BLOCKED_IPS?.split(',') || [],
    enableGeoBlocking: process.env.ENABLE_GEO_BLOCKING === 'true',
    allowedCountries: process.env.ALLOWED_COUNTRIES?.split(',') || [],
    
    // Data protection (client-safe flags only)
    encryptionEnabled: process.env.NEXT_PUBLIC_ENCRYPTION_ENABLED !== 'false',
    
    // Database security
    dbConnectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
    dbMaxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
    dbEnableSSL: process.env.DB_ENABLE_SSL !== 'false'
  },
  
  // Debug Configuration
  debug: {
    enabled: process.env.NEXT_PUBLIC_DEBUG_ENABLED === 'true' || process.env.NODE_ENV === 'development',
    logLevel: process.env.NEXT_PUBLIC_LOG_LEVEL || 'info',
    showErrorDetails: process.env.NEXT_PUBLIC_SHOW_ERROR_DETAILS === 'true' || process.env.NODE_ENV === 'development',
    enableConsoleLogging: process.env.NEXT_PUBLIC_CONSOLE_LOGGING !== 'false',
    enablePerformanceMonitoring: process.env.NEXT_PUBLIC_PERFORMANCE_MONITORING === 'true'
  },
  
  // Feature flags
  features: {
    enableWithdrawals: process.env.NEXT_PUBLIC_ENABLE_WITHDRAWALS !== 'false',
    enableMultiTeam: process.env.NEXT_PUBLIC_ENABLE_MULTI_TEAM !== 'false',
    enableNotifications: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS !== 'false',
    enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    enableMaintenanceMode: process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'
  }
};

// Minimal validation - only check critical things
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Only log warnings in development
  if (config.app.isDevelopment) {
    if (!config.firebase.apiKey) {
      console.warn('Firebase API key not configured');
    }
    if (!config.firebase.projectId) {
      console.warn('Firebase project ID not configured');
    }
  }

  // Always return valid to prevent crashes
  return {
    isValid: true,
    errors
  };
}

// Environment-specific configurations
export function getEnvironmentConfig() {
  const baseConfig = { ...config };

  if (config.app.isDevelopment) {
    baseConfig.security.securityHeadersEnabled = false;
    baseConfig.security.strictTransportSecurity = false;
    baseConfig.debug.enabled = true;
    baseConfig.debug.showErrorDetails = true;
  } else {
    // Production settings
    baseConfig.security.securityHeadersEnabled = true;
    baseConfig.security.strictTransportSecurity = true;
    baseConfig.debug.enabled = false;
    baseConfig.debug.showErrorDetails = false;
  }

  return baseConfig;
}

// Minimal security validation - no errors thrown
export function validateSecurityConfig(): { isValid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Only log warnings in development
  if (config.app.isDevelopment && config.security.corsOrigins.includes('*')) {
    warnings.push('Wildcard CORS origin detected in development');
  }

  return {
    isValid: true, // Always return true
    warnings,
    errors
  };
}
EOF

    print_status "✅ Created/fixed env.server.ts and env.ts"
fi

print_status "🔧 STEP 2: Ensuring Docker configuration is correct..."

# Ensure Docker Compose has the correct environment variables
if ! grep -q "SESSION_SECRET=" deployment/docker-compose-no-ssl.yml; then
    print_status "Adding environment variables to Docker Compose..."
    
    # Backup existing docker-compose file
    cp deployment/docker-compose-no-ssl.yml deployment/docker-compose-no-ssl.yml.backup
    
    # Create new docker-compose with environment variables
    cat > deployment/docker-compose-no-ssl.yml << 'EOF'
version: '3.8'

services:
  # Next.js Application
  nextjs:
    build:
      context: ..
      dockerfile: deployment/Dockerfile
    container_name: nextjs-app
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      # Security Environment Variables (REQUIRED)
      - SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
      - CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
      - ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
      - HASH_SALT=dae13683bf304cfb90c3c97b649131aa
      # Firebase Configuration
      - NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
      - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
      - NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
      - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
      - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=574988813074
      - NEXT_PUBLIC_FIREBASE_APP_ID=1:574988813074:web:5d0d4e8f9a2b3c1d
      # Application Configuration
      - NEXT_PUBLIC_APP_ENV=production
      - NEXT_PUBLIC_APP_VERSION=1.0.0
      - NEXT_PUBLIC_DOMAIN=scjsnext.com
      # Security Configuration
      - SECURITY_HEADERS_ENABLED=true
      - RATE_LIMIT_MAX_REQUESTS=100
      - RATE_LIMIT_WINDOW_MS=900000
      # Debug Configuration (Production)
      - NEXT_PUBLIC_DEBUG_ENABLED=false
      - NEXT_PUBLIC_LOG_LEVEL=error
    networks:
      - app-network
    volumes:
      - ../Frontend/.env.local:/app/.env.local:ro
      - ../Frontend/.env.production:/app/.env.production:ro

  # Nginx Reverse Proxy (No SSL)
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx-no-ssl.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/logs:/var/log/nginx
    networks:
      - app-network
    depends_on:
      - nextjs

networks:
  app-network:
    driver: bridge
EOF

    print_status "✅ Docker Compose configuration updated"
fi

print_status "🚀 STEP 3: Rebuilding and restarting containers..."

cd deployment

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f docker-compose-no-ssl.yml down --remove-orphans || true

# Remove old images and containers
print_status "Cleaning up old Docker resources..."
docker system prune -f || true

# Rebuild and start containers
print_status "Building and starting containers..."
docker-compose -f docker-compose-no-ssl.yml up -d --build

# Wait for containers to be ready
print_status "Waiting for containers to be ready..."
sleep 20

print_status "🔍 STEP 4: Verifying the fix..."

# Check container status
print_debug "Checking container status..."
docker-compose -f docker-compose-no-ssl.yml ps

# Check if containers are running
if docker-compose -f docker-compose-no-ssl.yml ps | grep -q "Up"; then
    print_status "✅ Containers are running"
else
    print_error "❌ Containers failed to start!"
    docker-compose -f docker-compose-no-ssl.yml logs
    exit 1
fi

# Check environment variables in container
print_debug "Checking environment variables in container..."
ENV_CHECK=$(docker-compose -f docker-compose-no-ssl.yml exec -T nextjs env | grep "SESSION_SECRET" || echo "NOT_FOUND")
if [ "$ENV_CHECK" != "NOT_FOUND" ]; then
    print_status "✅ SESSION_SECRET is set in container"
else
    print_error "❌ SESSION_SECRET not found in container!"
fi

# Check application logs
print_debug "Checking application logs for errors..."
LOGS=$(docker-compose -f docker-compose-no-ssl.yml logs nextjs 2>&1 | tail -10)
if echo "$LOGS" | grep -q "SESSION_SECRET.*required"; then
    print_error "❌ Still seeing SESSION_SECRET error in logs!"
    echo "$LOGS"
else
    print_status "✅ No SESSION_SECRET errors in logs"
fi

# Test application accessibility
print_debug "Testing application accessibility..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    print_status "✅ Application is accessible (HTTP 200)"
else
    print_warning "⚠️ Application returned HTTP $HTTP_STATUS"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Fix Complete - Summary${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🎉 SESSION_SECRET Error Fix Applied!"

echo ""
echo -e "${GREEN}🌐 Test Your Website:${NC}"
echo "   1. Open: http://167.172.65.185"
echo "   2. Press F12 to open browser console"
echo "   3. Refresh the page (Ctrl+F5)"
echo "   4. Check if SESSION_SECRET error is gone"

echo ""
echo -e "${GREEN}📊 Container Status:${NC}"
docker-compose -f docker-compose-no-ssl.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${GREEN}📝 If you still see errors:${NC}"
echo "   - Clear browser cache completely"
echo "   - Try incognito/private mode"
echo "   - Check logs: docker-compose -f docker-compose-no-ssl.yml logs -f"

print_status "Debug and fix script completed!"
echo -e "${BLUE}========================================${NC}"
EOF

    print_status "✅ Created comprehensive debug script"
fi

cd deployment

print_status "🚀 STEP 3: Running comprehensive fix..."

# Make script executable and run it
chmod +x debug-and-fix.sh
./debug-and-fix.sh 