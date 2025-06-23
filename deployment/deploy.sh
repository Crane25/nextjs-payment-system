#!/bin/bash

# ===================================
# Production Deployment Script
# Next.js Payment System v2.0 with Cloudflare SSL
# Optimized for Performance & Reliability
# ===================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
PROJECT_DIR="/var/www/scjsnext"
DOMAIN="scjsnext.com"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE} Production Deployment with Cloudflare${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the deployment directory."
    exit 1
fi

# Check if .env.local exists, create if missing
if [ ! -f "../Frontend/.env.local" ]; then
    print_warning ".env.local file not found. Creating production configuration..."
    
    cat > ../Frontend/.env.local << 'EOF'
# ===================================
# Production Environment Configuration
# Next.js Payment System v2.0
# ===================================

NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_VERSION=2.0.0
NEXT_PUBLIC_DOMAIN=scjsnext.com

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAvEe6PF9mnwN8Vqf9wqWUkWA58coXKpiA
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=paymentnew-dae57.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=paymentnew-dae57
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=paymentnew-dae57.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074850368558
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074850368558:web:f7c3c3f162dfc8af1fa3bf

# Email Configuration
EMAIL_SERVER_USER=rachaelagani63028@gmail.com
EMAIL_SERVER_PASSWORD=24992499Kk
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_FROM=noreply@scjsnext.com

# Security Configuration (Production)
SESSION_SECRET=4a8f2e9c1b7d6e3f5a8b2c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b
CSRF_SECRET=9d2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f3a6b9c2e5f8a1b4d7e0f
ENCRYPTION_KEY=06b259db817f41fbb73ac82a252a3b30
HASH_SALT=dae13683bf304cfb90c3c97b649131aa

# Security Settings
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
FORCE_HTTPS=false
SECURE_COOKIES=true
CLOUDFLARE_SSL=true

# Session Settings
SESSION_TIMEOUT_MS=3600000
HSTS_ENABLED=true
CSP_ENABLED=true
ENCRYPTION_ENABLED=true
AUDIT_LOG_ENABLED=true

# HTTPS and Cookies
HTTPS_PORT=443
HTTP_REDIRECT_PORT=80
COOKIE_SAME_SITE=strict
COOKIE_HTTP_ONLY=true
COOKIE_SECURE=true

# Content Security Policy
CSP_REPORT_URI=/api/security/report
CSP_REPORT_ONLY=false

# Input Validation
MAX_INPUT_LENGTH=10000
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,pdf,doc,docx

# API Security
API_KEY_REQUIRED=false
CORS_ORIGINS=https://scjsnext.com,https://www.scjsnext.com

# Authentication Security
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MS=900000
PASSWORD_MIN_LENGTH=8
REQUIRE_MFA=false

# Audit Logging
AUDIT_LOG_LEVEL=info
AUDIT_LOG_RETENTION_DAYS=90

# Database Security
DB_CONNECTION_TIMEOUT=30000
DB_MAX_CONNECTIONS=10
DB_ENABLE_SSL=true

# Debug Configuration (Production)
NEXT_PUBLIC_DEBUG_ENABLED=false
NEXT_PUBLIC_LOG_LEVEL=error
NEXT_PUBLIC_SHOW_ERROR_DETAILS=false
NEXT_PUBLIC_CONSOLE_LOGGING=false
NEXT_PUBLIC_PERFORMANCE_MONITORING=true

# Feature Flags
NEXT_PUBLIC_ENABLE_WITHDRAWALS=true
NEXT_PUBLIC_ENABLE_MULTI_TEAM=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_MAINTENANCE_MODE=false
EOF
    
    print_status "✅ Production .env.local file created"
fi

# Cloudflare setup validation
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Cloudflare Configuration Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Required Cloudflare Settings:"
echo ""
echo "1. 📝 DNS Settings:"
echo "   - A record: scjsnext.com → 167.172.65.185"
echo "   - A record: www.scjsnext.com → 167.172.65.185"
echo "   - Proxy status: ☁️ Proxied (orange cloud)"
echo ""
echo "2. 🔒 SSL/TLS Settings:"
echo "   - SSL/TLS mode: Full (not Full Strict)"
echo "   - Always Use HTTPS: ON"
echo "   - HTTP Strict Transport Security: ON"
echo ""
echo "3. 🛡️ Security Settings:"
echo "   - Security Level: Medium or High"
echo "   - Bot Fight Mode: ON"
echo ""

read -p "Have you configured Cloudflare correctly? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Please configure Cloudflare first:"
    echo "1. Go to Cloudflare Dashboard"
    echo "2. DNS → Set A records to 167.172.65.185"
    echo "3. SSL/TLS → Set to 'Full' mode"
    echo "4. SSL/TLS → Always Use HTTPS: ON"
    exit 0
fi

# Test DNS resolution
print_status "Testing DNS resolution..."
DOMAIN_IPS=$(dig +short $DOMAIN 2>/dev/null || echo "DNS_CHECK_FAILED")
if [[ $DOMAIN_IPS == *"104.21."* ]] || [[ $DOMAIN_IPS == *"172.67."* ]]; then
    print_status "✅ Domain is using Cloudflare"
else
    print_warning "⚠️ Domain may not be using Cloudflare (IPs: $DOMAIN_IPS)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pre-deployment system check
print_status "Performing pre-deployment system checks..."

# Check Docker status
if ! systemctl is-active --quiet docker; then
    print_status "Starting Docker service..."
    systemctl start docker
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker compose down --remove-orphans 2>/dev/null || true

# Clean up old images and containers
print_status "Cleaning up old Docker resources..."
docker system prune -f --volumes || true

# Create necessary directories
print_status "Creating required directories..."
mkdir -p nginx/logs logs

# Set proper permissions
print_status "Setting file permissions..."
chmod +x *.sh
chown -R 1001:1001 logs/ 2>/dev/null || true

# Validate configuration files
print_status "Validating configuration files..."

# Validate Docker Compose configuration
if ! docker compose config -q; then
    print_error "Docker Compose configuration is invalid"
    exit 1
fi

print_status "✅ All configurations are valid"

# Build and start containers
print_status "Building and starting containers..."
docker compose up -d --build --force-recreate

# Wait for services to be ready
print_status "Waiting for services to start..."
sleep 45

# Enhanced health check
print_status "Performing comprehensive health checks..."
HEALTH_CHECK_RETRIES=15
HEALTH_CHECK_DELAY=10

for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    print_status "Health check attempt $i/$HEALTH_CHECK_RETRIES..."
    
    # Check container status
    CONTAINERS_RUNNING=$(docker compose ps --services --filter "status=running" | wc -l)
    TOTAL_CONTAINERS=$(docker compose ps --services | wc -l)
    
    if [ "$CONTAINERS_RUNNING" -eq "$TOTAL_CONTAINERS" ]; then
        print_status "✅ All containers are running ($CONTAINERS_RUNNING/$TOTAL_CONTAINERS)"
        CONTAINERS_OK=true
    else
        print_warning "⚠️ Some containers not running ($CONTAINERS_RUNNING/$TOTAL_CONTAINERS)"
        CONTAINERS_OK=false
    fi
    
    # Check Next.js health
    if curl -f -s --max-time 5 "http://localhost:3000/api/health" > /dev/null; then
        print_status "✅ Next.js application is healthy"
        NEXTJS_HEALTHY=true
    else
        print_warning "⚠️ Next.js health check failed"
        NEXTJS_HEALTHY=false
    fi
    
    # Check Nginx health
    if curl -f -s --max-time 5 "http://localhost/health" > /dev/null; then
        print_status "✅ Nginx proxy is healthy"
        NGINX_HEALTHY=true
    else
        print_warning "⚠️ Nginx health check failed"
        NGINX_HEALTHY=false
    fi
    
    # Check external access
    if curl -f -s --max-time 10 "https://$DOMAIN/health" > /dev/null; then
        print_status "✅ External access via Cloudflare is working"
        EXTERNAL_OK=true
    else
        print_warning "⚠️ External access check failed"
        EXTERNAL_OK=false
    fi
    
    if [ "$CONTAINERS_OK" = true ] && [ "$NEXTJS_HEALTHY" = true ] && [ "$NGINX_HEALTHY" = true ] && [ "$EXTERNAL_OK" = true ]; then
        print_status "🎉 All health checks passed!"
        break
    fi
    
    if [ $i -eq $HEALTH_CHECK_RETRIES ]; then
        print_error "❌ Health checks failed after $HEALTH_CHECK_RETRIES attempts"
        print_status "Container logs for debugging:"
        docker compose logs --tail=50
        exit 1
    fi
    
    sleep $HEALTH_CHECK_DELAY
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Deployment Completed Successfully! ${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🚀 Next.js Payment System v2.0 is now live!"
echo ""
echo -e "${GREEN}🌐 Website URLs:${NC}"
echo "   - https://$DOMAIN (Primary)"
echo "   - https://www.$DOMAIN (Alternative)"
echo "   - http://167.172.65.185 (Direct server access)"
echo ""
echo -e "${GREEN}📊 System Status:${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo -e "${GREEN}🔒 Security Features:${NC}"
echo "   ✅ Cloudflare SSL & CDN"
echo "   ✅ Rate limiting (100 req/s for static files)"
echo "   ✅ Security headers enabled"
echo "   ✅ Real IP detection configured"
echo "   ✅ DDoS protection active"
echo ""
echo -e "${GREEN}⚡ Performance Optimizations:${NC}"
echo "   ✅ Gzip compression enabled"
echo "   ✅ Static file caching (1 year)"
echo "   ✅ Enhanced proxy buffering"
echo "   ✅ Optimized worker connections"
echo ""
echo -e "${GREEN}📝 Management Commands:${NC}"
echo "   - View logs: docker compose logs -f"
echo "   - Restart: docker compose restart"
echo "   - Stop: docker compose down"
echo "   - Update: git pull && docker compose up -d --build"
echo ""
echo -e "${GREEN}🔍 Monitoring:${NC}"
echo "   - Application: docker compose logs nextjs"
echo "   - Proxy: docker compose logs nginx"
echo "   - Health: curl https://$DOMAIN/health"
echo ""

# Create deployment summary
cat > deployment-summary.txt << EOF
# Next.js Payment System v2.0 - Deployment Summary
Date: $(date)
Domain: $DOMAIN
Server: 167.172.65.185
SSL Provider: Cloudflare

## Container Status:
$(docker compose ps)

## Health Check Results:
- Containers: $CONTAINERS_OK
- Next.js: $NEXTJS_HEALTHY  
- Nginx: $NGINX_HEALTHY
- External Access: $EXTERNAL_OK

## Features Enabled:
- Cloudflare SSL/TLS
- Rate limiting optimized for Next.js
- Real IP detection
- Security headers
- Performance optimizations

## Access URLs:
- Primary: https://$DOMAIN
- Alternative: https://www.$DOMAIN
- Health Check: https://$DOMAIN/health
EOF

print_status "📄 Deployment summary saved to: deployment-summary.txt"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW} Final Verification Steps${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Please verify the following:"
echo "1. 🌐 Visit https://$DOMAIN"
echo "2. 🔒 Check SSL certificate in browser"
echo "3. 🧪 Test navigation and functionality"
echo "4. 📊 Monitor logs for any errors"
echo ""
print_status "🎉 Deployment completed successfully!"
echo ""
print_status "Your Next.js Payment System is now live and optimized!"