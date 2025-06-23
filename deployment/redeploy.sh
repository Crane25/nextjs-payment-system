#!/bin/bash

# ===================================
# Quick Redeploy Script
# Next.js Payment System
# ===================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Quick Redeploy (No SSL)${NC}"
echo -e "${BLUE} Payment System v2.0${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose-no-ssl.yml" ]; then
    print_error "docker-compose-no-ssl.yml not found. Please run this script from the deployment directory."
    exit 1
fi

print_status "Stopping existing containers..."
docker-compose -f docker-compose-no-ssl.yml down --remove-orphans || true

print_status "Removing old images..."
docker image prune -f || true

print_status "Building and starting containers..."
docker-compose -f docker-compose-no-ssl.yml up -d --build

print_status "Waiting for containers to be ready..."
sleep 10

print_status "Checking container status..."
docker-compose -f docker-compose-no-ssl.yml ps

print_status "Testing nginx configuration..."
docker-compose -f docker-compose-no-ssl.yml exec nginx nginx -t

# Check if containers are running
if docker-compose -f docker-compose-no-ssl.yml ps | grep -q "Up"; then
    print_status "Containers are running successfully!"
else
    print_error "Some containers failed to start. Check logs:"
    docker-compose -f docker-compose-no-ssl.yml logs
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE} Redeploy Summary${NC}"
echo -e "${BLUE}========================================${NC}"
print_status "Application redeployed successfully!"

echo ""
echo -e "${GREEN}🌐 Website URLs:${NC}"
echo "   - http://167.172.65.185 (Server IP)"
echo "   - http://localhost (if accessing locally)"

echo ""
echo -e "${GREEN}📊 Container Status:${NC}"
docker-compose -f docker-compose-no-ssl.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${GREEN}📝 Useful Commands:${NC}"
echo "   - View logs: docker-compose -f docker-compose-no-ssl.yml logs -f"
echo "   - Restart: docker-compose -f docker-compose-no-ssl.yml restart"
echo "   - Stop: docker-compose -f docker-compose-no-ssl.yml down"

print_status "Testing application accessibility..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200"; then
    print_status "✅ Application is accessible!"
else
    print_warning "⚠️ Application may not be fully ready yet. Please wait a moment and try again."
fi

print_status "Redeploy completed!"
echo -e "${BLUE}========================================${NC}" 