#!/bin/bash

# ===================================
# Deployment Script for Next.js App
# Domain: scjsnext.com
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="scjsnext.com"
PROJECT_DIR="/var/www/scjsnext"
DEPLOYMENT_DIR="$PROJECT_DIR/deployment"

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Deploying Next.js Application${NC}"
echo -e "${BLUE} Domain: ${DOMAIN}${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found. Please run this script from the deployment directory."
    exit 1
fi

# Check if .env.local exists
if [ ! -f "../Frontend/.env.local" ]; then
    print_warning ".env.local file not found in Frontend directory"
    echo "Please create ../Frontend/.env.local with your environment variables"
    exit 1
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans || true

# Remove old images (optional)
read -p "Do you want to remove old Docker images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Removing old Docker images..."
    docker system prune -f
    docker image prune -a -f
fi

# Build and start containers
print_status "Building and starting containers..."
docker-compose up -d --build

# Wait for containers to be ready
print_status "Waiting for containers to be ready..."
sleep 10

# Check container status
print_status "Checking container status..."
docker-compose ps

# Test nginx configuration
print_status "Testing nginx configuration..."
docker-compose exec nginx nginx -t

# Check if containers are running
if docker-compose ps | grep -q "Up"; then
    print_status "Containers are running successfully!"
else
    print_error "Some containers failed to start"
    docker-compose logs
    exit 1
fi

# Setup SSL certificate (first time only)
if [ ! -f "./certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    print_status "Setting up SSL certificate..."
    
    # Request SSL certificate
    docker-compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email your-email@example.com \
        --agree-tos \
        --no-eff-email \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    # Reload nginx after getting certificate
    docker-compose exec nginx nginx -s reload
    
    print_status "SSL certificate obtained successfully!"
else
    print_status "SSL certificate already exists"
fi

# Setup SSL certificate renewal cron job
print_status "Setting up SSL certificate auto-renewal..."
(crontab -l 2>/dev/null || echo "") | grep -v "certbot renew" | crontab -
(crontab -l 2>/dev/null; echo "0 12 * * * cd $DEPLOYMENT_DIR && docker-compose run --rm certbot renew --quiet && docker-compose exec nginx nginx -s reload") | crontab -

# Display final status
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"

print_status "Application deployed successfully!"
echo ""
echo "🌐 Website URLs:"
echo "   - https://$DOMAIN"
echo "   - https://www.$DOMAIN"
echo ""
echo "📊 Container Status:"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "📝 Useful Commands:"
echo "   - View logs: docker-compose logs -f"
echo "   - Restart: docker-compose restart"
echo "   - Stop: docker-compose down"
echo "   - Update: git pull && docker-compose up -d --build"
echo ""

# Check if domain is accessible
print_status "Testing domain accessibility..."
if curl -s -I "http://$DOMAIN" | grep -q "301\|200"; then
    print_status "✅ Domain $DOMAIN is accessible!"
else
    print_warning "⚠️  Domain $DOMAIN might not be properly configured"
    echo "Please check your DNS settings:"
    echo "   - Point $DOMAIN to this server's IP: $(curl -s ifconfig.me)"
    echo "   - Point www.$DOMAIN to this server's IP: $(curl -s ifconfig.me)"
fi

print_status "Deployment completed!" 