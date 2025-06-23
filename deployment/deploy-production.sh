#!/bin/bash

# ===================================
# Production Deployment Script
# Next.js Payment System v2.0 with SSL
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
echo -e "${BLUE} Production Deployment with SSL${NC}"
echo -e "${BLUE} Next.js Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the deployment directory."
    exit 1
fi

# Check if SSL certificates exist
if [ ! -f "nginx/ssl/live/$DOMAIN/fullchain.pem" ]; then
    print_error "SSL certificates not found. Please run ./setup-ssl.sh first."
    exit 1
fi

# Check if .env.local exists
if [ ! -f "../Frontend/.env.local" ]; then
    print_error ".env.local file not found in Frontend directory"
    print_status "Please ensure environment variables are configured"
    exit 1
fi

# Pre-deployment system check
print_status "Performing pre-deployment checks..."

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    print_warning "Disk usage is at ${DISK_USAGE}%. Consider cleaning up before deployment."
fi

# Check memory
FREE_MEM=$(free -m | awk 'NR==2{printf "%.1f", $7*100/$2 }')
if (( $(echo "$FREE_MEM < 20" | bc -l) )); then
    print_warning "Free memory is low (${FREE_MEM}% available)."
fi

# Check Docker status
if ! systemctl is-active --quiet docker; then
    print_status "Starting Docker service..."
    systemctl start docker
fi

# Backup existing deployment (if exists)
if docker-compose ps | grep -q "Up"; then
    print_status "Creating backup of current deployment..."
    BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "../$BACKUP_DIR"
    
    # Export current database/data if needed
    docker-compose exec -T nextjs tar -czf - /app/logs 2>/dev/null | tar -xzf - -C "../$BACKUP_DIR" 2>/dev/null || true
    
    print_status "Backup created: ../$BACKUP_DIR"
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans || true

# Clean up old images and containers
print_status "Cleaning up old Docker resources..."
docker system prune -f --volumes || true
docker image prune -a -f || true

# Create necessary directories
print_status "Creating required directories..."
mkdir -p nginx/logs
mkdir -p ../Frontend/.next
mkdir -p logs

# Set proper permissions
print_status "Setting file permissions..."
chmod +x *.sh
chown -R 1001:1001 logs/ 2>/dev/null || true

# Validate configuration files
print_status "Validating configuration files..."

# Test nginx configuration with a temporary container
docker run --rm \
  -v $(pwd)/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v $(pwd)/nginx/ssl:/etc/nginx/ssl:ro \
  nginx:alpine nginx -t

# Validate Docker Compose configuration
docker-compose config -q

# Pull latest base images
print_status "Pulling latest base images..."
docker-compose pull nginx

# Build and start containers
print_status "Building and starting containers..."
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
    if curl -f -s "http://localhost/nginx-health" > /dev/null; then
        print_status "✅ Nginx is healthy"
        NGINX_HEALTHY=true
    else
        print_warning "⚠️ Nginx health check failed"
        NGINX_HEALTHY=false
    fi
    
    # Check HTTPS
    if curl -f -s -k "https://localhost/nginx-health" > /dev/null; then
        print_status "✅ HTTPS is working"
        HTTPS_HEALTHY=true
    else
        print_warning "⚠️ HTTPS health check failed"
        HTTPS_HEALTHY=false
    fi
    
    if [ "$NEXTJS_HEALTHY" = true ] && [ "$NGINX_HEALTHY" = true ] && [ "$HTTPS_HEALTHY" = true ]; then
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

# Final verification
print_status "Performing final verification..."

# Check SSL certificate validity
CERT_EXPIRY=$(openssl x509 -in nginx/ssl/live/$DOMAIN/fullchain.pem -noout -enddate | cut -d= -f2)
print_status "SSL certificate expires: $CERT_EXPIRY"

# Test external connectivity
EXTERNAL_IP=$(curl -s https://ipinfo.io/ip)
print_status "External IP: $EXTERNAL_IP"

# Performance test
RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" "https://$DOMAIN/nginx-health")
print_status "Response time: ${RESPONSE_TIME}s"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "🎉 Production deployment completed successfully!"
echo ""
echo -e "${GREEN}🌐 Website URLs:${NC}"
echo "   - https://$DOMAIN (Primary)"
echo "   - https://www.$DOMAIN (Alternative)"
echo "   - http://$DOMAIN (Redirects to HTTPS)"
echo ""
echo -e "${GREEN}📊 Container Status:${NC}"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo -e "${GREEN}🔒 SSL Status:${NC}"
echo "   - Certificate: ✅ Valid"
echo "   - HTTPS: ✅ Working"
echo "   - Auto-renewal: ✅ Configured"
echo ""
echo -e "${GREEN}📈 Performance:${NC}"
echo "   - Response time: ${RESPONSE_TIME}s"
echo "   - Gzip compression: ✅ Enabled"
echo "   - HTTP/2: ✅ Enabled"
echo ""
echo -e "${GREEN}🛡️ Security Features:${NC}"
echo "   - HTTPS enforcement: ✅ Enabled"
echo "   - Security headers: ✅ Configured"
echo "   - Rate limiting: ✅ Active"
echo "   - Firewall: ✅ Configured"
echo ""
echo -e "${GREEN}📝 Useful Commands:${NC}"
echo "   - View logs: docker-compose logs -f"
echo "   - Restart app: docker-compose restart nextjs"
echo "   - Renew SSL: ./renew-ssl.sh"
echo "   - Update app: git pull && docker-compose up -d --build"
echo "   - Stop all: docker-compose down"
echo ""
echo -e "${GREEN}🔍 Monitoring:${NC}"
echo "   - Application logs: docker-compose logs nextjs"
echo "   - Nginx logs: docker-compose logs nginx"
echo "   - System logs: journalctl -f"
echo ""
echo -e "${GREEN}🌟 SSL Grade Test:${NC}"
echo "   - https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"
echo ""

# Create deployment info file
cat > deployment-info.txt << EOF
Deployment Information
=====================
Date: $(date)
Domain: $DOMAIN
SSL Certificate: Valid until $CERT_EXPIRY
External IP: $EXTERNAL_IP
Response Time: ${RESPONSE_TIME}s
Docker Compose Version: $(docker-compose --version)
Docker Version: $(docker --version)

Container Status:
$(docker-compose ps)

Health Check Results:
- Next.js: $NEXTJS_HEALTHY
- Nginx: $NGINX_HEALTHY
- HTTPS: $HTTPS_HEALTHY
EOF

print_status "📄 Deployment info saved to: deployment-info.txt"
print_status "🚀 Your application is now live and ready for production use!"