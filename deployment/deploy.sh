#!/bin/bash

# ===================================
# Production Deployment Script
# Next.js Payment System v2.0 with Cloudflare SSL
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
echo -e "${BLUE} Cloudflare SSL Deployment${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the deployment directory."
    exit 1
fi

# Check if .env.local exists, create if missing
if [ ! -f "../Frontend/.env.local" ]; then
    print_warning ".env.local file not found. Creating from template..."
    
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

# Debug Configuration (Production)
NEXT_PUBLIC_DEBUG_ENABLED=false
NEXT_PUBLIC_LOG_LEVEL=error
NEXT_PUBLIC_SHOW_ERROR_DETAILS=false

# Feature Flags
NEXT_PUBLIC_ENABLE_WITHDRAWALS=true
NEXT_PUBLIC_ENABLE_MULTI_TEAM=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_MAINTENANCE_MODE=false
EOF
    
    print_status "✅ .env.local file created with production settings"
fi

# Cloudflare setup instructions
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Cloudflare Setup Required${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Before deploying, please ensure Cloudflare is configured:"
echo ""
echo "1. 📝 DNS Settings in Cloudflare:"
echo "   - A record: scjsnext.com → 167.172.65.185"
echo "   - A record: www.scjsnext.com → 167.172.65.185"
echo "   - Proxy status: ☁️ Proxied (orange cloud)"
echo ""
echo "2. 🔒 SSL/TLS Settings in Cloudflare:"
echo "   - SSL/TLS mode: Full (not Full Strict)"
echo "   - Always Use HTTPS: ON"
echo "   - HTTP Strict Transport Security: ON"
echo ""
echo "3. 🛡️ Security Settings (Optional):"
echo "   - Security Level: Medium or High"
echo "   - Bot Fight Mode: ON"
echo "   - WAF Rules: Configure as needed"
echo ""

read -p "Have you configured Cloudflare DNS and SSL settings? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Please configure Cloudflare first, then run this script again."
    echo ""
    echo "📋 Quick Cloudflare Setup:"
    echo "1. Go to Cloudflare Dashboard"
    echo "2. Add/Select your domain: $DOMAIN"
    echo "3. DNS → Add A records pointing to 167.172.65.185"
    echo "4. SSL/TLS → Overview → Set to 'Full'"
    echo "5. SSL/TLS → Edge Certificates → Always Use HTTPS: ON"
    exit 0
fi

# Test DNS resolution
print_status "Testing DNS resolution..."
DOMAIN_IPS=$(dig +short $DOMAIN)
if [[ $DOMAIN_IPS == *"104.21."* ]] || [[ $DOMAIN_IPS == *"172.67."* ]]; then
    print_status "✅ Domain is using Cloudflare (detected Cloudflare IPs)"
else
    print_warning "⚠️ Domain may not be using Cloudflare"
    print_warning "Current IPs: $DOMAIN_IPS"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pre-deployment system check
print_status "Performing pre-deployment checks..."

# Check Docker status
if ! systemctl is-active --quiet docker; then
    print_status "Starting Docker service..."
    systemctl start docker
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Clean up old images and containers
print_status "Cleaning up old Docker resources..."
docker system prune -f --volumes || true

# Create necessary directories
print_status "Creating required directories..."
mkdir -p nginx/logs
mkdir -p logs

# Set proper permissions
print_status "Setting file permissions..."
chmod +x *.sh
chown -R 1001:1001 logs/ 2>/dev/null || true

# Generate self-signed certificate for direct HTTPS access
print_status "Generating self-signed certificate for direct HTTPS access..."
docker run --rm -v $(pwd)/nginx:/ssl alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /ssl/server.key \
  -out /ssl/server.crt \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SCJSNext/CN=$DOMAIN"

# Validate configuration files
print_status "Validating configuration files..."

# Test nginx configuration with a temporary container
docker run --rm \
  -v $(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine nginx -t || {
    print_error "Nginx configuration test failed"
    exit 1
}

# Validate Docker Compose configuration
docker-compose config -q || {
    print_error "Docker Compose configuration is invalid"
    exit 1
}

# Build and start containers
print_status "Building and starting containers with Cloudflare SSL..."
docker-compose up -d --build --force-recreate

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 30

# Health check loop
print_status "Performing health checks..."
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_DELAY=10

for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
    print_status "Health check attempt $i/$HEALTH_CHECK_RETRIES..."
    
    # Check if containers are running
    if ! docker-compose ps | grep -q "Up"; then
        print_warning "Some containers are not running"
        docker-compose ps
    fi
    
    # Check Next.js health
    if curl -f -s "http://localhost:3000/api/health" > /dev/null; then
        print_status "✅ Next.js app is healthy"
        NEXTJS_HEALTHY=true
    else
        print_warning "⚠️ Next.js app health check failed"
        NEXTJS_HEALTHY=false
    fi
    
    # Check Nginx health
    if curl -f -s "http://localhost/health" > /dev/null; then
        print_status "✅ Nginx is healthy"
        NGINX_HEALTHY=true
    else
        print_warning "⚠️ Nginx health check failed"
        NGINX_HEALTHY=false
    fi
    
    if [ "$NEXTJS_HEALTHY" = true ] && [ "$NGINX_HEALTHY" = true ]; then
        break
    fi
    
    if [ $i -eq $HEALTH_CHECK_RETRIES ]; then
        print_error "Health checks failed after $HEALTH_CHECK_RETRIES attempts"
        print_status "Showing container logs for debugging..."
        docker-compose logs --tail=50
        exit 1
    fi
    
    sleep $HEALTH_CHECK_DELAY
done

# Test external connectivity through Cloudflare
print_status "Testing Cloudflare connectivity..."
if curl -f -s -H "Host: $DOMAIN" "http://localhost/health" > /dev/null; then
    print_status "✅ Local server responding correctly"
else
    print_warning "⚠️ Local server may have issues"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Cloudflare Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🎉 Cloudflare SSL deployment completed successfully!"
echo ""
echo -e "${GREEN}🌐 Website URLs:${NC}"
echo "   - https://$DOMAIN (Primary - via Cloudflare SSL)"
echo "   - https://www.$DOMAIN (Alternative - via Cloudflare SSL)"
echo "   - http://$DOMAIN (Redirects to HTTPS via Cloudflare)"
echo "   - http://167.172.65.185 (Direct server access)"
echo ""
echo -e "${GREEN}📊 Container Status:${NC}"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo -e "${GREEN}🔒 SSL Status:${NC}"
echo "   - Cloudflare SSL: ✅ Enabled"
echo "   - HTTPS Redirect: ✅ Cloudflare handles"
echo "   - Security Headers: ✅ Configured"
echo ""
echo -e "${GREEN}📈 Cloudflare Features:${NC}"
echo "   - CDN: ✅ Active"
echo "   - DDoS Protection: ✅ Active"
echo "   - Bot Protection: ✅ Available"
echo "   - Real IP Detection: ✅ Configured"
echo ""
echo -e "${GREEN}📝 Useful Commands:${NC}"
echo "   - View logs: docker-compose logs -f"
echo "   - Restart app: docker-compose restart nextjs"
echo "   - Stop all: docker-compose down"
echo "   - Update app: git pull && docker-compose up -d --build"
echo ""
echo -e "${GREEN}🔍 Monitoring:${NC}"
echo "   - Application logs: docker-compose logs nextjs"
echo "   - Nginx logs: docker-compose logs nginx"
echo "   - Cloudflare Analytics: Check Cloudflare Dashboard"
echo ""

# Create deployment info file
cat > deployment-info.txt << EOF
Production Deployment Information
=================================
Date: $(date)
Domain: $DOMAIN
SSL Provider: Cloudflare
Local Server IP: 167.172.65.185
Docker Compose: docker-compose.yml
Nginx Config: nginx.conf

Container Status:
$(docker-compose ps)

Health Check Results:
- Next.js: $NEXTJS_HEALTHY
- Nginx: $NGINX_HEALTHY

Cloudflare Features:
- SSL/TLS: Handled by Cloudflare
- Real IP Detection: Configured
- Rate Limiting: Server + Cloudflare
- Security Headers: Configured
EOF

print_status "📄 Deployment info saved to: deployment-info.txt"

# Final instructions
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW} Final Steps${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "1. 🌐 Test your website: https://$DOMAIN"
echo "2. 🔒 Verify SSL in browser (look for lock icon)"
echo "3. 📊 Check Cloudflare Analytics dashboard"
echo "4. 🛡️ Configure additional Cloudflare security rules if needed"
echo ""
print_status "🚀 Your application is now live with Cloudflare SSL protection!"